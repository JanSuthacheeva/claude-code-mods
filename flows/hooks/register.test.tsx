import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'

import type { BandView, Navigation } from '../types'
import { demoBoard } from './fixtures'

type FlowAnswer = { exitCode: number; stdout: string } | 'missing'

interface Host {
  clock: MockClock
  calls: string[][]
  answer: FlowAnswer
  store: Map<string, unknown>
  state: Map<string, { value: unknown; version: number }>
  toasts: string[]
  toolResults: Record<string, unknown>
  failTool: string | null
}

function installHost(on: On, store: Record<string, unknown> = {}, env: Record<string, string> = {}): Host {
  const host: Host = {
    clock: mock.clock(on, { now: demoBoard.now }),
    calls: [],
    answer: { exitCode: 0, stdout: JSON.stringify(demoBoard) },
    store: new Map(Object.entries(store)),
    state: new Map(),
    toasts: [],
    toolResults: {},
    failTool: null,
  }
  on('tool.call', ($, e) => {
    if (host.failTool === e.tool) throw new Error(`${e.tool} failed`)
    return { result: host.toolResults[e.tool] ?? null } as never
  })
  mock.env(on, env)
  on('ui.toast', ($, e) => {
    host.toasts.push(e.text)
    return { value: undefined }
  })
  on('store.get', ($, e) => ({ value: host.store.get(e.key) }))
  on('store.set', ($, e) => {
    host.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('state.get', ($, e) => ({ value: host.state.get(e.key) ?? { value: undefined, version: 0 } }))
  on('state.set', ($, e) => {
    const version = (host.state.get(e.key)?.version ?? 0) + 1
    host.state.set(e.key, { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('process.run', ($, e) => {
    host.calls.push([...e.argv])
    if (e.argv[0] === 'uname') return { value: { exitCode: 0, stdout: 'Darwin\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (e.argv[0] === 'open') return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (host.answer === 'missing') return { deny: `spawn ${e.argv[0] ?? ''} ENOENT` }
    return {
      value: { exitCode: host.answer.exitCode, stdout: host.answer.stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  return host
}

async function start($: Engine): Promise<void> {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
}

function typed(args: string) {
  return {
    command: 'flows',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  } as const
}

function bandView(host: Host): BandView | undefined {
  return host.state.get('view')?.value as BandView | undefined
}

function navigationOf(host: Host): Navigation | undefined {
  return host.state.get('navigation')?.value as Navigation | undefined
}

test('/flows shows the board from flow status --json and remembers it, and hides it again', async ($, on) => {
  const host = installHost(on)
  await start($)
  expect(host.calls.filter(call => call[0] === 'flow')).toEqual([])

  expect(await $.command.run(typed(''))).toEqual(expect.objectContaining({ text: 'Flows shown.' }))
  expect(host.calls.filter(call => call[0] === 'flow')).toEqual([['flow', 'status', '--json']])
  expect(bandView(host)?.board).toEqual(demoBoard)
  expect(host.store.get('isShown')).toBe(true)

  expect(await $.command.run(typed(''))).toEqual(expect.objectContaining({ text: 'Flows hidden.' }))
  expect(host.store.get('isShown')).toBe(false)
})

test('a session shows the board again when it was shown before', async ($, on) => {
  const host = installHost(on, { isShown: true })

  await start($)
  await host.clock.advance(0)

  expect(host.calls.length).toBeGreaterThan(0)
  expect(bandView(host)?.board?.count).toBe(4)
})

test('refreshes every two seconds only while shown', async ($, on) => {
  const host = installHost(on)
  await start($)
  const flowCalls = () => host.calls.filter(call => call[0] === 'flow').length
  await host.clock.advance(2_000)
  expect(flowCalls()).toBe(0)

  await $.command.run(typed(''))
  await host.clock.advance(2_000)
  expect(flowCalls()).toBe(2)

  await $.command.run(typed(''))
  await host.clock.advance(4_000)
  expect(flowCalls()).toBe(2)
})

test('/flows <name> opens that flow, and says when there is none', async ($, on) => {
  const host = installHost(on)
  await start($)

  expect(await $.command.run(typed('shop-230'))).toEqual(expect.objectContaining({ text: 'Showing shop-230.' }))
  expect(navigationOf(host)?.tab).toBe(demoBoard.flows[1]?.id)

  expect(await $.command.run(typed('shop-999'))).toEqual(expect.objectContaining({ text: 'No flow named shop-999.' }))
  expect(navigationOf(host)?.tab).toBe(demoBoard.flows[1]?.id)
})

test('keeps why there is no board: missing binary, a failing flow, another version', async ($, on) => {
  const host = installHost(on)
  await start($)

  host.answer = 'missing'
  await $.command.run(typed(''))
  expect(bandView(host)).toEqual({ board: null, problem: { kind: 'missing', path: 'flow' } })

  host.answer = { exitCode: 1, stdout: 'error: cannot find a state directory\nhelp[1]: Set FLOW_HOME' }
  await host.clock.advance(2_000)
  expect(bandView(host)?.problem).toEqual({ kind: 'failed', message: 'cannot find a state directory' })

  host.answer = { exitCode: 0, stdout: JSON.stringify({ ...demoBoard, version: 2 }) }
  await host.clock.advance(2_000)
  expect(bandView(host)?.problem).toEqual({ kind: 'unsupported', version: 2 })
})

test('falls back to All when the open flow is cleared', async ($, on) => {
  const host = installHost(on)
  await start($)
  await $.command.run(typed('shop-221'))

  host.answer = { exitCode: 0, stdout: JSON.stringify({ ...demoBoard, flows: demoBoard.flows.slice(1), count: 3 }) }
  await host.clock.advance(2_000)

  expect(navigationOf(host)?.tab).toBeNull()
})

function underBand(on: On, text = 'beneath the board'): void {
  on('ui.render', { component: 'AbovePrompt' }, (engine, e) => {
    const { Text } = engine.ui.resolve(e)
    return h(Text, {}, text) as RenderElement
  })
}

async function mountBand($: Engine, hasSurvey = false) {
  return $.ui.mount({
    plugin: 'flows',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {
      hasSurvey,
      isWorking: false,
      maxRows: 40,
      bodyColumns: 120,
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  })
}

test('draws the tab row and one card per flow on All', async ($, on) => {
  installHost(on)
  underBand(on)
  await start($)
  await $.command.run(typed(''))

  const band = await mountBand($)

  expect(await band.find({ type: 'Text', text: /flows/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: ' All ' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: ' 2 need you ' })).toBeDefined()
  for (const name of ['shop-221', 'shop-230', 'export-csv', 'shop-198']) {
    expect(await band.find({ type: 'Text', text: name })).toBeDefined()
  }
  expect(await band.find({ type: 'Text', text: ' blocked ' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: 'Task 5: the migration needs a default value for exported_at' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: 'agent: review changes' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /0-9 jump/ })).toBeDefined()
  await band.unmount()
})

test("draws one flow's card, timeline and decisions on its tab", async ($, on) => {
  installHost(on)
  underBand(on)
  await start($)
  await $.command.run(typed('shop-221'))

  const band = await mountBand($)

  expect(await band.find({ type: 'Text', text: ' shop-221 ' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: ' auto ' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: 'TIMELINE' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: 'phase: implement' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: '2 older · j' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: 'DECISIONS' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: ' ! ' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: 'agent: review changes' })).toBeUndefined()
  await band.unmount()
})

test('stacks the board above whatever another mod draws in the band', async ($, on) => {
  installHost(on)
  underBand(on, 'skill-usage counts')
  await start($)

  const hidden = await mountBand($)
  expect(await hidden.find({ type: 'Text', text: 'skill-usage counts' })).toBeDefined()
  expect(await hidden.find({ type: 'Text', text: /flows/ })).toBeUndefined()
  await hidden.unmount()

  await $.command.run(typed(''))
  const shown = await mountBand($)
  expect(await shown.find({ type: 'Text', text: 'skill-usage counts' })).toBeDefined()
  expect(await shown.find({ type: 'Text', text: 'shop-221' })).toBeDefined()
  await shown.unmount()
})

test('steps aside while a survey holds the band', async ($, on) => {
  installHost(on)
  underBand(on)
  await start($)
  await $.command.run(typed(''))

  const band = await mountBand($, true)

  expect(await band.find({ type: 'Text', text: 'shop-221' })).toBeUndefined()
  await band.unmount()
})

test('says how to install flow when the binary is missing', async ($, on) => {
  const host = installHost(on)
  underBand(on)
  host.answer = 'missing'
  await start($)
  await $.command.run(typed(''))

  const band = await mountBand($)

  expect(await band.find({ type: 'Text', text: /flow is not installed at "flow"/ })).toBeDefined()
  await band.unmount()
})

const ids = demoBoard.flows.map(flow => flow.id)

test('digits jump between All and the flow tabs', async ($, on) => {
  const host = installHost(on)
  underBand(on)
  await start($)
  await $.command.run(typed(''))
  const band = await mountBand($)

  await band.press({ key: `tab-${ids[1] ?? ''}` })
  expect(navigationOf(host)?.tab).toBe(ids[1])

  await band.press({ key: 'tab-all' })
  expect(navigationOf(host)?.tab).toBeNull()
  await band.unmount()
})

test('h and l step through the tabs, wrapping around', async ($, on) => {
  const host = installHost(on)
  underBand(on)
  await start($)
  await $.command.run(typed(''))
  const band = await mountBand($)

  await band.press({ key: 'key-l' })
  expect(navigationOf(host)?.tab).toBe(ids[0])
  await band.press({ key: 'key-h' })
  await band.press({ key: 'key-h' })
  expect(navigationOf(host)?.tab).toBe(ids[3])
  await band.unmount()
})

test('j and k move the cursor over the cards on All, and Enter opens one', async ($, on) => {
  const host = installHost(on)
  underBand(on)
  await start($)
  await $.command.run(typed(''))
  const band = await mountBand($)

  await band.press({ key: 'key-j' })
  await band.press({ key: 'key-j' })
  await band.press({ key: 'key-k' })
  expect(navigationOf(host)?.cursor).toBe(1)

  await band.press({ key: `row-${ids[1] ?? ''}` })
  expect(navigationOf(host)?.tab).toBe(ids[1])
  await band.unmount()
})

test('j and k scroll the timeline on a flow tab, and g goes back to the newest', async ($, on) => {
  const host = installHost(on)
  underBand(on)
  await start($)
  await $.command.run(typed('shop-221'))
  const band = await mountBand($)

  await band.press({ key: 'key-j' })
  await band.press({ key: 'key-j' })
  expect(navigationOf(host)?.offset).toBe(2)

  await band.press({ key: 'key-g' })
  expect(navigationOf(host)?.offset).toBe(0)
  await band.unmount()
})

test('o opens the merge request of the flow, or says there is none yet', async ($, on) => {
  const host = installHost(on)
  underBand(on)
  await start($)
  await $.command.run(typed('shop-198'))
  const band = await mountBand($)

  await band.press({ key: 'key-o' })
  expect(host.calls).toContainEqual(['open', 'https://gitlab.com/acme/shop/-/merge_requests/88'])

  await $.command.run(typed('shop-221'))
  await band.press({ key: 'key-o' })
  expect(host.toasts).toEqual(['shop-221 has no merge request yet'])
  await band.unmount()
})

test('shows the board again after /clear starts a fresh session', async ($, on) => {
  const host = installHost(on)
  underBand(on)
  await start($)
  await $.command.run(typed(''))

  await $.session.end({ reason: 'clear', sessionId: 'first', resume: { id: 'first' } })
  host.state.clear()
  await host.clock.advance(2_000)

  const band = await mountBand($)
  expect(await band.find({ type: 'Text', text: 'shop-221' })).toBeDefined()
  await band.unmount()
})

const worker = { FLOW_ID: 'flow-7' }

function reports(host: Host): string[][] {
  return host.calls.filter(call => call[1] === 'report').map(call => call.slice(2))
}

test('a session without a flow id reports nothing', async ($, on) => {
  const host = installHost(on)
  await start($)

  await host.clock.advance(60_000)

  expect(reports(host)).toEqual([])
})

test('a worker sends a heartbeat every 30 seconds to the flow in FLOW_ID', async ($, on) => {
  const host = installHost(on, {}, worker)
  await start($)

  await host.clock.advance(60_000)

  expect(reports(host)).toEqual([
    ['--flow', 'flow-7', 'heartbeat'],
    ['--flow', 'flow-7', 'heartbeat'],
  ])
})

test('says once when flow cannot take reports, then stays quiet', async ($, on) => {
  const host = installHost(on, {}, worker)
  host.answer = { exitCode: 1, stdout: 'error: no flow named flow-7' }
  await start($)

  await host.clock.advance(90_000)

  expect(reports(host)).toHaveLength(3)
  expect(host.toasts).toEqual(['flows: could not report to flow - no flow named flow-7'])
})

function turnEnd(answer: string, agentId?: string) {
  return {
    answer,
    durationMs: 10,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    ...(agentId === undefined ? {} : { agentId }),
  } as const
}

async function settle(host: Host): Promise<void> {
  await host.clock.advance(1)
}

test('reports a phase when a phase skill starts, and nothing for other skills', async ($, on) => {
  const host = installHost(on, {}, worker)
  await start($)

  await $.skill.prompt({ skill: 'design-code', text: 'Plan the design', frontmatter: {} })
  await $.skill.prompt({ skill: 'commit', text: 'Commit', frontmatter: {} })
  await settle(host)

  expect(reports(host)).toEqual([['--flow', 'flow-7', 'phase', 'design']])
})

test('reports waiting when the main turn ends, working when the next one starts', async ($, on) => {
  const host = installHost(on, {}, worker)
  await start($)

  await $.turn.complete(turnEnd('The approaches page is open.\nWhich approach do you pick?'))
  await $.turn.complete(turnEnd('subagent finished', 'agent-1'))
  await $.turn.start({ text: 'A', turnId: 't2' })
  await settle(host)

  expect(reports(host)).toEqual([
    ['--flow', 'flow-7', 'waiting', 'Which approach do you pick?'],
    ['--flow', 'flow-7', 'working'],
  ])
})

test('reports ended when the session ends, but not for /clear', async ($, on) => {
  const host = installHost(on, {}, worker)
  await start($)

  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: { id: 's1' } })

  expect(reports(host)).toEqual([['--flow', 'flow-7', 'ended']])
})

test('reports delegated while a foreground subagent runs, then working', async ($, on) => {
  const host = installHost(on, {}, worker)
  await start($)

  await $.tool.call({ tool: 'Agent', description: 'implement plan', prompt: 'build it' })
  await $.tool.call({ tool: 'Agent', description: 'watch logs', prompt: 'x', run_in_background: true } as never)
  await settle(host)

  expect(reports(host)).toEqual([
    ['--flow', 'flow-7', 'delegated', 'implement plan'],
    ['--flow', 'flow-7', 'working'],
  ])
})

test('reports working again when a subagent fails, and lets the failure through', async ($, on) => {
  const host = installHost(on, {}, worker)
  host.failTool = 'Agent'
  await start($)

  await expect($.tool.call({ tool: 'Agent', description: 'implement plan', prompt: 'x' })).rejects.toThrow()
  await settle(host)

  expect(reports(host).map(report => report[2])).toEqual(['delegated', 'working'])
})

test("ignores a subagent's turn starts while it runs", async ($, on) => {
  const host = installHost(on, {}, worker)
  on('tool.call', { tool: 'Agent' }, async (engine, e, next) => {
    await $.turn.start({ text: '', turnId: 'sub' })
    return next(e)
  })
  await start($)

  await $.tool.call({ tool: 'Agent', description: 'review changes', prompt: 'x' })
  await settle(host)

  expect(reports(host).map(report => report[2])).toEqual(['delegated', 'working'])
})

test('reports waiting while Claude asks a question, working once answered', async ($, on) => {
  const host = installHost(on, {}, worker)
  await start($)

  await $.tool.call({
    tool: 'AskUserQuestion',
    questions: [{ question: 'Which approach?', header: 'Approach', multiSelect: false, options: [] }],
  } as never)
  await settle(host)

  expect(reports(host)).toEqual([
    ['--flow', 'flow-7', 'waiting', 'Which approach?'],
    ['--flow', 'flow-7', 'working'],
  ])
})

test('reports task counts and blocks from plan-progress reports', async ($, on) => {
  const host = installHost(on, {}, worker)
  const tool = 'mcp__plan-progress__report'
  await start($)

  host.toolResults[tool] = 'ok, 4/9 done - next: 5 Add the export'
  await $.tool.call({ tool, item: '4', status: 'done' } as never)
  host.toolResults[tool] = 'ok, 4/9 done'
  await $.tool.call({ tool, item: '5', status: 'blocked', note: 'migration needs a default' } as never)
  await settle(host)

  expect(reports(host)).toEqual([
    ['--flow', 'flow-7', 'tasks', '4', '9'],
    ['--flow', 'flow-7', 'blocked', '5: migration needs a default'],
  ])
})

test('reports the merge request a gh or glab create printed', async ($, on) => {
  const host = installHost(on, {}, worker)
  const url = 'https://gitlab.com/acme/shop/-/merge_requests/88'
  await start($)

  host.toolResults['Bash'] = { stdout: `Creating merge request\n${url}\n`, stderr: '', interrupted: false }
  await $.tool.call({ tool: 'Bash', command: 'glab mr create --fill' })
  host.toolResults['Bash'] = { stdout: 'ok', stderr: '', interrupted: false }
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await settle(host)

  expect(reports(host)).toEqual([['--flow', 'flow-7', 'merge-request', url]])
})
