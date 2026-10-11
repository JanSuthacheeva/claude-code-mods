import type { On, UiPane } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { flatPlan } from './fixtures'

const planPath = '/repo/docs/plans/billing.md'
const tool = 'mcp__plan-progress__report'

interface Host {
  files: Map<string, string>
  panes: UiPane[]
}

function installHost(on: On, files: Record<string, string> = { [planPath]: flatPlan }): Host {
  const host: Host = { files: new Map(Object.entries(files)), panes: [] }
  let modified = 0

  mock.clock(on, { now: Date.parse('2026-10-11T09:00:00.000Z') })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.root', () => ({ value: '/repo' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__plan-progress__${e.name}` } }))
  on('fs.read', ($, e) => {
    const text = host.files.get(e.path)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('fs.write', ($, e) => {
    host.files.set(e.path, e.text)
    modified += 1
    return { value: undefined }
  })
  on('fs.stat', ($, e) => {
    if (!host.files.has(e.path)) throw new Error(`ENOENT: ${e.path}`)
    return { value: { kind: 'file', size: host.files.get(e.path)?.length ?? 0, mtimeMs: modified, isLink: false } }
  })
  on('ui.panes', () => ({ value: host.panes }))
  on('ui.open', ($, e) => {
    if (!host.panes.some(pane => pane.id === e.id)) {
      host.panes.push({ id: e.id, title: e.title ?? e.id, isShown: true, isFocused: false, isPlaced: true })
    }
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    host.panes = host.panes.filter(pane => pane.id !== e.id)
    return { value: undefined }
  })
  return host
}

async function start($: Engine): Promise<void> {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
}

function typed(args: string) {
  return {
    command: 'plan-progress',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  } as const
}

async function mountPane($: Engine, surface: 'terminal' | 'desktop') {
  return $.ui.mount({
    plugin: 'plan-progress',
    surface,
    component: 'Pane',
    requestId: 'plan-progress',
    props: {
      title: 'Plan',
      isFocused: false,
      bodyColumns: 50,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  })
}

test('a done report ticks the checkbox in the plan and answers what is next', async ($, on) => {
  const host = installHost(on)
  await start($)

  const answer = await $.tool.call({ tool, plan: 'docs/plans/billing.md', item: 'T2', status: 'done' })

  expect(host.files.get(planPath)).toContain('- [x] T2. Back office lists')
  expect(answer).toEqual(expect.objectContaining({ result: 'ok, 2/3 done - next: 3 T3. Connect payload' }))
})

test('refuses a report before any plan is tracked, and an ambiguous item', async ($, on) => {
  installHost(on)
  await start($)

  expect(await $.tool.call({ tool, item: '1', status: 'doing' })).toEqual({
    deny: expect.stringMatching(/No plan is tracked yet/),
  })
  expect(await $.tool.call({ tool, plan: planPath, item: 'T', status: 'doing' })).toEqual({
    deny: expect.stringMatching(/matches several items/),
  })
})

test('opens the pane on the first report and draws progress on every surface', async ($, on) => {
  const host = installHost(on)
  await start($)

  await $.tool.call({ tool, plan: planPath, item: '2', status: 'doing', note: 'two tests red' })
  expect(host.panes.map(pane => pane.id)).toEqual(['plan-progress'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await mountPane($, surface)
    expect(await pane.find({ type: 'Text', text: /^1\/3$/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^Now$/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^two tests red$/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^now$/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /T3. Connect payload/ })).toBeDefined()
    await pane.unmount()
  }
})

test('keeps the tracked plan for the next session of the project', async ($, on) => {
  installHost(on)
  await start($)
  await $.tool.call({ tool, plan: planPath, item: '2', status: 'doing' })
  await $.command.run(typed(''))

  await start($)
  const pane = await mountPane($, 'terminal')

  expect(await pane.find({ type: 'Text', text: /T2. Back office lists/ })).toBeDefined()
  await pane.unmount()
})

test('the command toggles the pane, tracks a file and stops tracking', async ($, on) => {
  const host = installHost(on)
  await start($)

  expect(await $.command.run(typed('docs/plans/billing.md'))).toEqual(
    expect.objectContaining({ text: 'Tracking billing.md.' }),
  )
  expect(host.panes).toHaveLength(1)

  await $.command.run(typed(''))
  expect(host.panes).toHaveLength(0)

  await $.command.run(typed('stop'))
  const pane = await mountPane($, 'terminal')
  expect(await pane.find({ type: 'Text', text: /No plan tracked in this project/ })).toBeDefined()
  await pane.unmount()
})

test('a plan reported after stop opens the pane again', async ($, on) => {
  const host = installHost(on)
  await start($)
  await $.command.run(typed('docs/plans/billing.md'))

  await $.command.run(typed('stop'))
  expect(host.panes).toHaveLength(0)
  await $.tool.call({ tool, plan: planPath, item: '2', status: 'doing' })

  expect(host.panes.map(pane => pane.id)).toEqual(['plan-progress'])
})

test('shows a missing plan file instead of failing', async ($, on) => {
  installHost(on, {})
  await start($)

  await $.command.run(typed('docs/plans/gone.md'))
  const pane = await mountPane($, 'terminal')

  expect(await pane.find({ type: 'Text', text: /Plan file not found: \/repo\/docs\/plans\/gone.md/ })).toBeDefined()
  await pane.unmount()
})
