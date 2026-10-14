import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BandView, Board, Navigation } from '../types'
import { parseBoard } from './board'
import { reconcile, start } from './navigation'

const commandName = 'flows'
const pollIntervalMs = 2_000
const statusTimeoutMs = 5_000
const shownKey = 'isShown'

const settings = { flowPath: 'flow' }
const emptyView: BandView = { board: null, problem: null }

const view = atom({ plugin: 'flows', key: 'view' } as const, emptyView)
const navigation = atom({ plugin: 'flows', key: 'navigation' } as const, start)
const isShown = atom({ plugin: 'flows', key: 'isShown' } as const, false)

// Board

async function readBoard($: EngineInterface): Promise<BandView> {
  let result
  try {
    result = await $.process.run([settings.flowPath, 'status', '--json'], { timeoutMs: statusTimeoutMs })
  } catch {
    return { board: null, problem: { kind: 'missing', path: settings.flowPath } }
  }
  if (result.exitCode !== 0) {
    const firstLine = (result.stdout.trim() || result.stderr.trim()).split('\n')[0] ?? ''
    return { board: null, problem: { kind: 'failed', message: firstLine.replace(/^error: /, '') } }
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

async function navigate($: EngineInterface, move: (board: Board, at: Navigation) => Navigation): Promise<void> {
  const { board } = await read($, view)
  if (board !== null) await update($, navigation, at => move(board, at))
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
    const wasShown = (await $.store.get(shownKey)) === true
    await update($, isShown, () => wasShown)
    $.clock.every(pollIntervalMs, () => {
      void (async () => {
        if (await read($, isShown)) await refresh($)
      })().catch(() => undefined)
    })
    if (wasShown) void refresh($).catch(() => undefined)
    return next(e)
  })

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
}
