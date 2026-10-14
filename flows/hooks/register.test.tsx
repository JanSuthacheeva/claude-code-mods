import type { On } from 'claude-code'
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
}

function installHost(on: On, store: Record<string, unknown> = {}): Host {
  const host: Host = {
    clock: mock.clock(on, { now: demoBoard.now }),
    calls: [],
    answer: { exitCode: 0, stdout: JSON.stringify(demoBoard) },
    store: new Map(Object.entries(store)),
    state: new Map(),
  }
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
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('process.run', ($, e) => {
    host.calls.push([...e.argv])
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
  expect(host.calls).toEqual([])

  expect(await $.command.run(typed(''))).toEqual(expect.objectContaining({ text: 'Flows shown.' }))
  expect(host.calls).toEqual([['flow', 'status', '--json']])
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
  await host.clock.advance(2_000)
  expect(host.calls).toHaveLength(0)

  await $.command.run(typed(''))
  await host.clock.advance(2_000)
  expect(host.calls).toHaveLength(2)

  await $.command.run(typed(''))
  await host.clock.advance(4_000)
  expect(host.calls).toHaveLength(2)
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
