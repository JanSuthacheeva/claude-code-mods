import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BandView, Board, Navigation, Observation, Problem } from '../types'
import { bandModel, parseBoard } from './board'
import type { BandModel, CardModel, DetailModel, Pill, Step } from './board'
import type { Platform } from './browser'
import { detectPlatform, isWindows, openUrlArgv } from './browser'
import { reportArgs } from './reporter'
import { currentFlow, jumpTo, moveCursor, reconcile, scrollTimeline, start, stepTab, toTop } from './navigation'

const commandName = 'flows'
const pollIntervalMs = 2_000
const statusTimeoutMs = 5_000
const shownKey = 'isShown'

const settings = { flowPath: 'flow' }
const emptyView: BandView = { board: null, problem: null }

const view = atom({ plugin: 'flows', key: 'view' } as const, emptyView)
const navigation = atom({ plugin: 'flows', key: 'navigation' } as const, start)
const isShown = atom({ plugin: 'flows', key: 'isShown' } as const, false)

const heartbeatIntervalMs = 30_000
const reportTimeoutMs = 5_000

let bandId: string | null = null
let platform: Platform | null = null
let flowId: string | null = null
let runningAgents = 0
let reportQueue: Promise<void> = Promise.resolve()
let hasWarned = false

const pillStart = '\u{E0B6}'
const pillEnd = '\u{E0B4}'
const mark = '\u{F0E7}'
const maxTaskBar = 24

// Board

async function readBoard($: EngineInterface): Promise<BandView> {
  let result
  try {
    result = await $.process.run([settings.flowPath, 'status', '--json'], { timeoutMs: statusTimeoutMs })
  } catch {
    return { board: null, problem: { kind: 'missing', path: settings.flowPath } }
  }
  if (result.exitCode !== 0) {
    return { board: null, problem: { kind: 'failed', message: firstLine(result.stdout, result.stderr) } }
  }
  const parsed = parseBoard(result.stdout)
  return 'kind' in parsed ? { board: null, problem: parsed } : { board: parsed, problem: null }
}

async function refresh($: EngineInterface): Promise<void> {
  const next = await readBoard($)
  await update($, view, () => next)
  const { board } = next
  if (board !== null) await update($, navigation, at => reconcile(board, at))
}

async function show($: EngineInterface, shown: boolean): Promise<void> {
  await update($, isShown, () => shown)
  await $.store.set(shownKey, shown)
  if (shown) await refresh($)
}

/** /clear resets the session's state without a session.start, so this also runs after one. */
async function restoreVisibility($: EngineInterface): Promise<void> {
  const wasShown = (await $.store.get(shownKey)) === true
  await update($, isShown, () => wasShown)
  if (wasShown) await refresh($)
}

async function navigate($: EngineInterface, move: (board: Board, at: Navigation) => Navigation): Promise<void> {
  const { board } = await read($, view)
  if (board !== null) await update($, navigation, at => move(board, at))
}

async function focusCursor($: EngineInterface): Promise<void> {
  const { board } = await read($, view)
  const at = await read($, navigation)
  if (board === null || at.tab !== null || bandId === null) return
  const flow = currentFlow(board, at)
  if (flow) await $.ui.focus({ requestId: bandId, key: `row-${flow.id}` }).catch(() => undefined)
}

async function moveDown($: EngineInterface, by: -1 | 1): Promise<void> {
  const at = await read($, navigation)
  if (at.tab === null) {
    await navigate($, (b, current) => moveCursor(b, current, by))
    await focusCursor($)
  } else {
    await navigate($, (b, current) => scrollTimeline(b, current, by))
  }
}

async function goToTop($: EngineInterface): Promise<void> {
  await navigate($, (_, at) => toTop(at))
  await focusCursor($)
}

async function openMergeRequest($: EngineInterface): Promise<void> {
  const { board } = await read($, view)
  const flow = board === null ? null : currentFlow(board, await read($, navigation))
  if (flow === null) return
  if (flow.mergeRequest === null) {
    await $.ui.toast(`${flow.name} has no merge request yet`)
    return
  }
  if (platform === null) {
    const osVariable = await $.env.get('OS')
    const kernel = isWindows(osVariable)
      ? null
      : await $.process
          .run(['uname', '-s'], { timeoutMs: statusTimeoutMs })
          .then(result => result.stdout.trim())
          .catch(() => null)
    platform = detectPlatform(osVariable, kernel)
  }
  const opened = await $.process
    .run(openUrlArgv(platform, flow.mergeRequest), { timeoutMs: statusTimeoutMs })
    .then(result => result.exitCode === 0)
    .catch(() => false)
  if (!opened) await $.ui.toast(`Could not open ${flow.mergeRequest}`)
}

// Reporting

/** Feeds one observation through reportArgs; no-op without a flow id or a report. Never throws. */
function observe($: EngineInterface, observation: Observation): void {
  if (flowId === null) return
  const args = reportArgs(observation)
  if (args !== null) enqueueReport($, args)
}

/** Appends one flow report call to the queue, so reports reach flow in event order. */
function enqueueReport($: EngineInterface, args: readonly string[]): void {
  reportQueue = reportQueue.then(() => runReport($, args)).catch(() => undefined)
}

/** Runs flow report --flow <flowId> ...args; a failure toasts once and is otherwise dropped. */
async function runReport($: EngineInterface, args: readonly string[]): Promise<void> {
  if (flowId === null) return
  let failure: string | null = null
  try {
    const result = await $.process.run([settings.flowPath, 'report', '--flow', flowId, ...args], {
      timeoutMs: reportTimeoutMs,
    })
    if (result.exitCode !== 0) failure = firstLine(result.stdout, result.stderr)
  } catch {
    failure = `flow is not installed at "${settings.flowPath}"`
  }
  if (failure === null || hasWarned) return
  hasWarned = true
  await $.ui.toast(`flows: could not report to flow - ${failure}`)
}

function firstLine(stdout: string, stderr: string): string {
  return ((stdout.trim() || stderr.trim()).split('\n')[0] ?? '').replace(/^error: /, '')
}

// Hooks

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const flowPath = options['flowPath']
    if (typeof flowPath === 'string' && flowPath.trim() !== '') settings.flowPath = flowPath.trim()
    await $.command.register({
      name: commandName,
      description: 'Toggle the flows board above the prompt, or open one flow: /flows <name>',
      argumentHint: '[name]',
    })
    flowId = (await $.env.get('FLOW_ID'))?.trim() || null
    $.clock.every(heartbeatIntervalMs, () => observe($, { kind: 'heartbeat' }))
    await restoreVisibility($)
    $.clock.every(pollIntervalMs, () => {
      void (async () => {
        if (await read($, isShown)) await refresh($)
      })().catch(() => undefined)
    })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    observe($, { kind: 'session-end', reason: e.reason })
    await reportQueue
    const result = await next(e)
    if (e.reason === 'clear') void restoreVisibility($).catch(() => undefined)
    return result
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const isBackground = (e as unknown as Record<string, unknown>)['run_in_background'] === true
    if (isBackground) return next(e)
    runningAgents += 1
    observe($, { kind: 'delegated', description: e.description })
    try {
      return await next(e)
    } finally {
      runningAgents -= 1
      observe($, { kind: 'agent-done' })
    }
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const questions = (e as unknown as { questions?: { question?: unknown }[] }).questions
    const first = questions?.[0]?.question
    if (typeof first === 'string') observe($, { kind: 'question', text: first })
    const result = await next(e)
    observe($, { kind: 'answered' })
    return result
  })

  on('tool.call', { tool: 'mcp__plan-progress__report' }, async ($, e, next) => {
    const result = await next(e)
    const input = e as unknown as Record<string, unknown>
    const status = input['status']
    if ('deny' in result || (status !== 'doing' && status !== 'done' && status !== 'blocked')) return result
    observe($, {
      kind: 'plan-report',
      status,
      item: String(input['item'] ?? ''),
      note: typeof input['note'] === 'string' ? input['note'] : null,
      result: typeof result.result === 'string' ? result.result : JSON.stringify(result.result ?? ''),
    })
    return result
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    if (flowId !== null && !('deny' in result)) {
      const output = result.result as { stdout?: unknown } | null | undefined
      const stdout = typeof output?.stdout === 'string' ? output.stdout : ''
      observe($, { kind: 'command', command: e.command, stdout })
    }
    return result
  })

  on('skill.prompt', ($, e, next) => {
    observe($, { kind: 'skill', skill: e.skill })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', ($, e, next) => {
    if (runningAgents === 0) observe($, { kind: 'turn-start' })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) observe($, { kind: 'turn-end', answer: e.answer })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: commandName }, async ($, e) => {
    const name = e.args.trim()
    if (name === '') {
      const shown = !(await read($, isShown))
      await show($, shown)
      return { text: shown ? 'Flows shown.' : 'Flows hidden.' }
    }
    await show($, true)
    const { board } = await read($, view)
    const flow = board?.flows.find(candidate => candidate.name === name || candidate.id === name)
    if (!flow) return { text: `No flow named ${name}.` }
    await navigate($, (_, at) => ({ ...at, tab: flow.id, offset: 0 }))
    return { text: `Showing ${flow.name}.` }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isShown))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    bandId = e.requestId
    const { board, problem } = await read($, view)
    const beneath = await next(e)

    const pill = ({ text, tone }: Pill) => (
      <Text>
        <Text color={tone}>{pillStart}</Text>
        <Text backgroundColor={tone} color="inverseText" weight="bold">
          {` ${text} `}
        </Text>
        <Text color={tone}>{pillEnd}</Text>
      </Text>
    )

    const steps = (items: Step[], withTimes: boolean) => (
      <Text wrap="truncate-end">
        {items.map((step, index) => (
          <Text key={step.phase}>
            {index > 0 && <Text color={step.tone === 'inactive' ? 'inactive' : 'success'}>{' ── '}</Text>}
            <Text color={step.tone}>{step.glyph}</Text>
            {withTimes && (
              <Text color={step.tone} weight={step.isCurrent ? 'bold' : 'regular'}>
                {` ${step.label}${step.duration === '' ? '' : ` ${step.duration}`}`}
              </Text>
            )}
          </Text>
        ))}
      </Text>
    )

    const taskBar = (tasks: { done: number; total: number } | null, width: number) => {
      const filled = tasks === null || tasks.total === 0 ? 0 : Math.round((tasks.done / tasks.total) * width)
      return (
        <Text>
          <Text color="success">{'━'.repeat(filled)}</Text>
          <Text color="inactive">{'━'.repeat(width - filled)}</Text>
        </Text>
      )
    }

    const drawTabs = (model: BandModel) => (
      <Box gap={1}>
        <Box flexShrink={0}>
          <Text weight="bold" color="claude">{`${mark} flows  `}</Text>
        </Box>
        {model.tabs.map((tab, index) => (
          <Button key={tab.key} hotkey={tab.hotkey} plain onPress={() => void navigate($, (b, at) => jumpTo(b, at, index))}>
            {tab.isActive ? pill({ text: tab.label, tone: 'claude' }) : <Text dimColor>{` ${tab.label}`}</Text>}
            {tab.mark !== null && <Text color={tab.markTone}>{` ${tab.mark}`}</Text>}
          </Button>
        ))}
        {model.moreFlows > 0 && <Text dimColor>+{model.moreFlows}</Text>}
        <Box flexGrow={1} flexShrink={1} />
        {model.needsYou !== null && <Box flexShrink={0}>{pill(model.needsYou)}</Box>}
      </Box>
    )

    const drawCard = (card: CardModel, width: number) => (
      <Box key={card.key} width={width} flexDirection="column" borderStyle="round" borderColor={card.borderTone} paddingX={1}>
        <Box gap={1}>
          <Box flexGrow={1} flexShrink={1}>
            <Button key={card.key} plain onPress={() => void navigate($, (_, at) => ({ ...at, tab: card.flowId, offset: 0 }))}>
              <Text weight="bold">{card.name}</Text>
            </Button>
          </Box>
          <Box flexShrink={0}>{pill(card.state)}</Box>
        </Box>
        <Box gap={2}>
          {steps(card.rail, false)}
          <Text color={card.rail.find(step => step.isCurrent)?.tone ?? (card.railLabel === 'done' ? 'success' : 'subtle')} weight="bold">
            {card.railLabel}
          </Text>
        </Box>
        <Box gap={1}>
          {taskBar(card.tasks, Math.min(maxTaskBar, Math.max(8, width - 26)))}
          <Text dimColor>{card.tasks === null ? 'no tasks yet' : `${String(card.tasks.done)}/${String(card.tasks.total)}`}</Text>
          <Box flexGrow={1} />
          <Text dimColor>{card.age} ago</Text>
        </Box>
        <Text color={card.line.tone} wrap="truncate-end">
          {card.line.text}
        </Text>
      </Box>
    )

    const drawCards = (rows: CardModel[][], columns: number) => {
      const perRow = rows[0]?.length ?? 1
      const width = Math.floor((columns - (perRow - 1)) / perRow)
      return (
        <Box flexDirection="column" marginTop={1}>
          {rows.map((row, index) => (
            <Box key={`cards-${String(index)}`} gap={1}>
              {row.map(card => drawCard(card, width))}
            </Box>
          ))}
        </Box>
      )
    }

    const drawDetail = (detail: DetailModel) => (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderColor={detail.borderTone} paddingX={1} marginTop={1}>
          <Box gap={1}>
            <Text weight="bold">{detail.name}</Text>
            {pill(detail.state)}
            {pill(detail.mode)}
            <Box flexGrow={1} />
            <Text dimColor>{detail.started}</Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {detail.request}
          </Text>
          <Box gap={3}>
            <Box flexShrink={1}>{steps(detail.steps, true)}</Box>
            <Box flexGrow={1} />
            <Text>
              {taskBar(detail.tasks, 14)}
              <Text dimColor>{detail.tasks === null ? ' no tasks' : ` ${String(detail.tasks.done)}/${String(detail.tasks.total)}`}</Text>
            </Text>
          </Box>
          {detail.blocker !== null && (
            <Box gap={1}>
              {pill({ text: detail.blocker.badge, tone: detail.blocker.tone })}
              <Text color={detail.blocker.tone} wrap="truncate-end">
                {detail.blocker.text}
              </Text>
            </Box>
          )}
        </Box>
        <Box gap={4} marginTop={1} paddingX={1}>
          <Box flexDirection="column" width="50%" flexShrink={1}>
            <Text dimColor weight="bold">
              TIMELINE
            </Text>
            {detail.timeline.map((entry, index) => (
              <Box key={`entry-${String(index)}`} gap={1}>
                <Text color={entry.tone}>{entry.glyph}</Text>
                <Box width={4} flexShrink={0}>
                  <Text dimColor>{entry.ago}</Text>
                </Box>
                <Text color={entry.tone} wrap="truncate-end">
                  {entry.text}
                </Text>
              </Box>
            ))}
            {detail.older > 0 && <Text dimColor>{`${String(detail.older)} older · j`}</Text>}
          </Box>
          <Box flexDirection="column" width="50%" flexShrink={1}>
            <Text dimColor weight="bold">
              DECISIONS
            </Text>
            {detail.decisions.length === 0 && <Text dimColor>none yet</Text>}
            {detail.decisions.map(decision => (
              <Text key={decision} wrap="truncate-end">
                <Text color="claude">◆ </Text>
                {decision}
              </Text>
            ))}
          </Box>
        </Box>
      </Box>
    )

    const legendKey = (key: string, hotkey: string, label: string, onPress: () => Promise<void>) => (
      <Button key={key} hotkey={hotkey} plain dimColor label={label} onPress={() => void onPress().catch(() => undefined)} />
    )

    const drawLegend = () => (
      <Box gap={2}>
        <Box flexGrow={1} />
        {legendKey('key-h', 'h', '‹', () => navigate($, (b, at) => stepTab(b, at, -1)))}
        {legendKey('key-l', 'l', '›', () => navigate($, (b, at) => stepTab(b, at, 1)))}
        {legendKey('key-j', 'j', '↓', () => moveDown($, 1))}
        {legendKey('key-k', 'k', '↑', () => moveDown($, -1))}
        {legendKey('key-g', 'g', 'top', () => goToTop($))}
        {legendKey('key-o', 'o', 'MR', () => openMergeRequest($))}
        <Text dimColor>0-9 jump · ctrl+x tab for keys</Text>
      </Box>
    )

    const drawProblem = (reason: Problem | null) => (
      <Box gap={1}>
        <Text weight="bold" color="claude">{`${mark} flows`}</Text>
        <Text color="warning" wrap="truncate-end">
          {problemText(reason)}
        </Text>
      </Box>
    )

    const model = board === null ? null : bandModel(board, await read($, navigation), e.props.bodyColumns - 2)
    const tree =
      model === null ? (
        drawProblem(problem)
      ) : (
        <Box flexDirection="column">
          {drawTabs(model)}
          {model.cards !== null && drawCards(model.cards, e.props.bodyColumns - 2)}
          {model.detail !== null && drawDetail(model.detail)}
          {drawLegend()}
        </Box>
      )

    return (
      <Box flexDirection="column" paddingX={1}>
        {tree}
        {beneath}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}

function problemText(problem: Problem | null): string {
  if (problem === null) return 'Reading flows...'
  switch (problem.kind) {
    case 'missing':
      return `flow is not installed at "${problem.path}" - run cargo install --path ~/projects/flow, or set flowPath`
    case 'failed':
      return `flow failed: ${problem.message}`
    case 'unsupported':
      return `flow speaks contract v${String(problem.version)}; update the flows mod`
  }
}
