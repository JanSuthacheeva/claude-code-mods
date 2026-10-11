import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PlanView, Progress, ReportStatus } from '../types'
import { resolveItem } from './matching'
import { parseOutline, withTicked } from './outline'
import { paneModel } from './pane'
import type { ItemState, PaneModel } from './pane'
import {
  absolutePath,
  emptyProgress,
  fileName,
  linesToTick,
  summaryLine,
  targetRef,
  targetText,
  withReport,
} from './progress'

const paneId = 'plan-progress'
const paneTitle = 'Plan'
const commandName = 'plan-progress'
const toolName = 'report'
const pollIntervalMs = 2_000
const clockIntervalMs = 30_000
const statuses: readonly ReportStatus[] = ['doing', 'done', 'blocked']

const emptyView: PlanView = { progress: null, outline: null, error: null }

const view = atom({ plugin: 'plan-progress', key: 'view' } as const, emptyView)
const isClosedByPerson = atom({ plugin: 'plan-progress', key: 'isClosedByPerson' } as const, false)
const now = atom({ plugin: 'plan-progress', key: 'now' } as const, 0)

const toolDescription = [
  'Report progress on the markdown plan you are working through, shown to the user in the plan-progress pane.',
  "Call with status 'doing' right before you start each checkbox item, 'done' as soon as it is finished, 'blocked' when you are stuck.",
  "'done' ticks the checkbox in the plan file for you; do not edit checkboxes yourself.",
  'Pass plan on the first call. The result says what is next.',
].join(' ')

const toolSchema = {
  type: 'object',
  properties: {
    plan: { type: 'string', description: 'Path of the plan file; only needed on the first call or to switch plans' },
    item: { type: 'string', description: "The item's ref from a previous result (e.g. 2.1), or part of its text" },
    status: { type: 'string', enum: statuses },
    note: { type: 'string', description: 'Optional, a few words on what is happening' },
  },
  required: ['item', 'status'],
}

let lastModifiedMs: number | null = null

// Plan file and store

async function storeKey($: EngineInterface): Promise<string> {
  return `project:${await $.session.root()}`
}

async function saveProgress($: EngineInterface, progress: Progress | null): Promise<void> {
  const key = await storeKey($)
  if (progress === null) await $.store.delete(key)
  else await $.store.set(key, progress)
}

async function storedProgress($: EngineInterface): Promise<Progress | null> {
  const value = await $.store.get(await storeKey($))
  return typeof value === 'object' && value !== null && 'plan' in value ? (value as Progress) : null
}

async function modifiedMs($: EngineInterface, path: string): Promise<number | null> {
  try {
    return (await $.fs.stat(path)).mtimeMs
  } catch {
    return null
  }
}

async function showPlan($: EngineInterface, progress: Progress | null): Promise<void> {
  if (progress === null) {
    lastModifiedMs = null
    await update($, view, () => emptyView)
    return
  }

  lastModifiedMs = await modifiedMs($, progress.plan)
  if (lastModifiedMs === null) {
    await update($, view, () => ({ progress, outline: null, error: `Plan file not found: ${progress.plan}` }))
    return
  }
  const outline = parseOutline(await $.fs.read(progress.plan))
  await update($, view, () => ({ progress, outline, error: null }))
}

async function trackPlan($: EngineInterface, path: string): Promise<Progress> {
  const plan = absolutePath(await $.session.cwd(), path)
  const current = (await read($, view)).progress
  const progress = current?.plan === plan ? current : emptyProgress(plan)
  await saveProgress($, progress)
  await showPlan($, progress)
  return progress
}

async function pollPlan($: EngineInterface): Promise<void> {
  const { progress } = await read($, view)
  if (progress === null) return
  const modified = await modifiedMs($, progress.plan)
  if (modified !== lastModifiedMs) await showPlan($, progress)
}

// Pane

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === paneId)
}

async function openPaneUnasked($: EngineInterface): Promise<void> {
  if ((await read($, isClosedByPerson)) || (await isPaneOpen($))) return
  await $.ui.open({ id: paneId, title: paneTitle })
}

// Tool

function textField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

async function report($: EngineInterface, input: Record<string, unknown>): Promise<string> {
  const plan = textField(input['plan'])
  const item = textField(input['item'])
  const status = statuses.find(one => one === input['status'])
  if (item === null || status === undefined) throw new Error(`Pass item and a status of ${statuses.join(', ')}.`)

  const progress = plan !== null ? await trackPlan($, plan) : (await read($, view)).progress
  if (progress === null) throw new Error('No plan is tracked yet. Pass plan with the path of the plan file.')
  if ((await modifiedMs($, progress.plan)) === null) throw new Error(`Plan file not found: ${progress.plan}`)

  const markdown = await $.fs.read(progress.plan)
  const resolution = resolveItem(parseOutline(markdown), item)
  if ('error' in resolution) throw new Error(resolution.error)

  const lines = status === 'done' ? linesToTick(resolution.target) : []
  if (lines.length > 0) await $.fs.write(progress.plan, withTicked(markdown, lines))

  const reported = withReport(progress, {
    ref: targetRef(resolution.target),
    text: targetText(resolution.target),
    status,
    note: textField(input['note']),
    at: await $.clock.now(),
  })
  await update($, now, () => reported.recent[0]?.at ?? 0)
  await saveProgress($, reported)
  await showPlan($, reported)
  await openPaneUnasked($)

  const { outline } = await read($, view)
  return outline === null ? 'ok' : summaryLine(outline, reported.recent[0] ?? null)
}

// Drawing

const icons: Record<ItemState, { glyph: string; color: string }> = {
  done: { glyph: '✓', color: 'success' },
  active: { glyph: '▸', color: 'claude' },
  blocked: { glyph: '!', color: 'warning' },
  open: { glyph: '○', color: 'text' },
}

const panePadding = 1

const statusColors: Record<ReportStatus, string> = { doing: 'claude', done: 'success', blocked: 'warning' }

// Hooks

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: commandName,
      description: 'Toggle the plan progress pane, or track a plan: /plan-progress <file>, /plan-progress stop',
      argumentHint: '[file | stop]',
    })
    await $.tool.register({ name: toolName, description: toolDescription, inputSchema: toolSchema, isDeferred: false })

    await update($, now, () => 0)
    await showPlan($, await storedProgress($))
    $.clock.every(pollIntervalMs, () => void pollPlan($).catch(() => undefined))
    $.clock.every(clockIntervalMs, () => void $.clock.now().then(time => update($, now, () => time)))
    void $.clock.now().then(time => update($, now, () => time))
    if ((await read($, view)).progress !== null && e.isInteractive) void openPaneUnasked($)

    return next(e)
  })

  on('tool.call', { tool: 'mcp__plan-progress__report' }, async ($, e) => {
    try {
      return { result: await report($, e as Record<string, unknown>) }
    } catch (error) {
      return { deny: error instanceof Error ? error.message : String(error) }
    }
  }).catch(() => ({ deny: 'plan-progress could not record the report.' }))

  on('command.run', { command: commandName }, async ($, e) => {
    const argument = e.args.trim()

    if (argument === 'stop') {
      await saveProgress($, null)
      await showPlan($, null)
      await $.ui.close({ id: paneId })
      return { text: 'Stopped tracking the plan.' }
    }

    if (argument !== '') {
      const progress = await trackPlan($, argument)
      await update($, isClosedByPerson, () => false)
      await $.ui.open({ id: paneId, title: paneTitle })
      return { text: `Tracking ${fileName(progress.plan)}.` }
    }

    if (await isPaneOpen($)) {
      await $.ui.close({ id: paneId })
      return { text: 'Plan progress hidden.' }
    }
    await update($, isClosedByPerson, () => false)
    await $.ui.open({ id: paneId, title: paneTitle })
    return { text: 'Plan progress shown.' }
  }).catch(($, e, next) => next(e))

  on('ui.close', { id: paneId }, async ($, e, next) => {
    if (e.origin.kind === 'person') await update($, isClosedByPerson, () => true)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: paneId }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { progress, outline, error } = await read($, view)
    const time = await read($, now)

    if (progress === null) {
      return (
        <Box flexDirection="column" gap={1} paddingX={panePadding}>
          <Text bold>No plan tracked in this project</Text>
          <Text>
            Claude starts tracking when it works through a plan with checkboxes, or run /plan-progress &lt;file&gt;.
          </Text>
        </Box>
      )
    }

    if (error !== null || outline === null) {
      return (
        <Box flexDirection="column" gap={1} paddingX={panePadding}>
          <Text color="warning">{error ?? 'Reading the plan...'}</Text>
          <Text>Run /plan-progress &lt;file&gt; to track another plan, or /plan-progress stop.</Text>
        </Box>
      )
    }

    const model: PaneModel = paneModel(progress.plan, outline, progress, time, e.props.bodyColumns - 2 * panePadding)

    if (model.total === 0) {
      return (
        <Box flexDirection="column" gap={1} paddingX={panePadding}>
          <Text bold wrap="truncate-end">
            {model.title}
          </Text>
          <Text>No checkbox items in {fileName(progress.plan)}. Add "- [ ]" items to track progress.</Text>
        </Box>
      )
    }

    const statusColumnWidth = Math.max(0, ...model.recent.map(row => row.status.length)) + 1
    const barColor = model.isComplete ? 'success' : 'claude'
    const focusColor = model.focus?.label === 'Blocked' ? 'warning' : model.focus?.label === 'Now' ? 'claude' : 'subtle'

    return (
      <Box flexDirection="column" paddingX={panePadding}>
        <Box gap={2}>
          <Box flexGrow={1} flexShrink={1}>
            <Text bold wrap="truncate-end">
              {model.title}
            </Text>
          </Box>
          {model.isComplete ? (
            <Text color="success">complete</Text>
          ) : (
            <Text dimColor>
              {model.done}/{model.total}
            </Text>
          )}
        </Box>
        <Text wrap="truncate-end">
          <Text color={barColor}>{'━'.repeat(model.bar.filled)}</Text>
          <Text color="inactive">{'━'.repeat(model.bar.empty)}</Text>
        </Text>

        {model.focus !== null && (
          <Box flexDirection="column" marginTop={1}>
            <Box gap={1}>
              <Box width={7} flexShrink={0}>
                <Text color={focusColor} bold>
                  {model.focus.label}
                </Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="truncate-end">
                  <Text dimColor>{model.focus.ref}</Text> {model.focus.text}
                </Text>
              </Box>
              {model.focus.age !== null && <Text dimColor>{model.focus.age}</Text>}
            </Box>
            {model.focus.note !== null && (
              <Box gap={1}>
                <Box width={7} flexShrink={0} />
                <Text dimColor wrap="truncate-end">
                  {model.focus.note}
                </Text>
              </Box>
            )}
            {model.next !== null && (
              <Box gap={1}>
                <Box width={7} flexShrink={0}>
                  <Text bold>Next</Text>
                </Box>
                <Text wrap="truncate-end">
                  <Text dimColor>{model.next.ref}</Text> {model.next.text}
                </Text>
              </Box>
            )}
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          {model.groups.map(group => (
            <Box key={group.ref} flexDirection="column">
              {group.title !== null && (
                <Box gap={1}>
                  <Text color={icons[group.state].color}>{icons[group.state].glyph}</Text>
                  <Box flexGrow={1} flexShrink={1}>
                    <Text wrap="truncate-end" bold={group.state === 'active' || group.state === 'blocked'}>
                      {group.title}
                    </Text>
                  </Box>
                  <Text dimColor>
                    {group.done}/{group.total}
                  </Text>
                </Box>
              )}
              {group.items?.map(item => (
                <Box key={item.ref} gap={1} paddingLeft={(group.title === null ? 0 : 2) + item.depth * 2}>
                  <Text color={icons[item.state].color}>{icons[item.state].glyph}</Text>
                  <Text wrap="truncate-end">{item.text}</Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>

        {model.recent.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Recent</Text>
            <Box flexDirection="column">
              {model.recent.map(row => (
                <Box key={row.key} gap={1}>
                  <Box width={statusColumnWidth} flexShrink={0}>
                    <Text color={statusColors[row.status]}>{row.status}</Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1}>
                    <Text wrap="truncate-end">
                      <Text dimColor>{row.ref}</Text> {row.text}
                    </Text>
                  </Box>
                  <Text dimColor>{row.age}</Text>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
