import type { CommandInfo, On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { Usage } from '../types'

const usagePath = '/home/test/.claude/skill-usage.json'

function typed(command: string) {
  return {
    command,
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  } as const
}

const commands: CommandInfo[] = [
  { name: 'clear', description: '', source: 'builtin' },
  { name: 'commit', description: '', source: 'user' },
  { name: 'superpowers:brainstorming', description: '', source: 'plugin', plugin: 'superpowers' },
  { name: 'mrs', description: '', source: 'plugin', plugin: 'merge-status' },
]

function installHost(on: On): () => Usage {
  const files = new Map<string, string>()
  mock.env(on, { HOME: '/home/test' })
  mock.clock(on, { now: Date.parse('2026-10-10T08:00:00.000Z') })
  on('fs.exists', ($, e) => ({ value: files.has(e.path) }))
  on('fs.read', ($, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('command.list', () => ({ value: commands }))
  return () => JSON.parse(files.get(usagePath) ?? '{}') as Usage
}

function answerSkillCalls($: Engine, on: On): void {
  on('tool.call', { tool: 'Skill' }, async (_, e) => {
    await $.skill.prompt({ skill: e.skill, text: 'body' })
    return { result: { success: true, commandName: e.skill } }
  })
}

test('counts Claude invocations through the Skill tool', async ($, on) => {
  const usage = installHost(on)
  answerSkillCalls($, on)

  await $.tool.call({ tool: 'Skill', skill: 'commit' })
  await $.command.run(typed('skill-usage'))

  expect(usage().skills['commit']).toEqual(expect.objectContaining({ user: 0, claude: 1, preload: 0 }))
})

async function type($: Engine, text: string): Promise<void> {
  await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })
}

test('counts a typed skill as a user invocation, by its listed name', async ($, on) => {
  const usage = installHost(on)

  await type($, '/commit fix the readme')
  await type($, '/brainstorming')
  await $.command.run(typed('skill-usage'))

  expect(usage().skills['commit']).toEqual(expect.objectContaining({ user: 1, claude: 0, preload: 0 }))
  expect(usage().skills['superpowers:brainstorming']).toEqual(expect.objectContaining({ user: 1 }))
})

test('leaves built-in commands and commands a mod registers uncounted', async ($, on) => {
  const usage = installHost(on)

  await type($, '/clear')
  await type($, '/mrs')
  await type($, '/skill-usage')
  await $.command.run(typed('skill-usage'))

  expect(usage().skills).toEqual({})
  expect(usage().prompts).toBe(3)
})

test('counts a typed skill once when its prompt is expanded too', async ($, on) => {
  const usage = installHost(on)

  await type($, '/commit')
  await $.skill.prompt({ skill: 'commit', text: 'body' })
  await $.command.run(typed('skill-usage'))

  expect(usage().skills['commit']).toEqual(expect.objectContaining({ user: 1, claude: 0, preload: 0 }))
})

test('counts a skill expanded without an invocation as a preload', async ($, on) => {
  const usage = installHost(on)

  await $.skill.prompt({ skill: 'brainstorming', text: 'body' })
  await $.command.run(typed('skill-usage'))

  expect(usage().skills['brainstorming']).toEqual(expect.objectContaining({ user: 0, claude: 0, preload: 1 }))
})

test('shows the counts above the prompt while toggled on', async ($, on) => {
  installHost(on)
  answerSkillCalls($, on)
  on('ui.render', { component: 'AbovePrompt' }, (engine, e) => {
    const { Box } = engine.ui.resolve(e)
    return h(Box, {}) as RenderElement
  })

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Skill', skill: 'commit' })
  await $.command.run(typed('skill-usage'))

  for (const [surface, bodyColumns] of [
    ['terminal', 100],
    ['terminal', 50],
    ['desktop', 140],
  ] as const) {
    const ui = await $.ui.mount({
      plugin: 'skill-usage',
      surface,
      component: 'AbovePrompt',
      props: {
        hasSurvey: false,
        isWorking: false,
        maxRows: 20,
        bodyColumns,
        scroll: { offset: 0, bodyRows: 20 },
        view: {},
      },
    })
    expect(await ui.find({ type: 'Text', text: /1 turns/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /commit/ })).toBeDefined()

    await $.command.run(typed('skill-usage'))
    expect(await ui.find({ type: 'Text', text: /commit/ })).toBeUndefined()

    await ui.unmount()
    await $.command.run(typed('skill-usage'))
  }
})

test('shows only a hint, without headers or legend, before any skill is invoked', async ($, on) => {
  installHost(on)
  on('ui.render', { component: 'AbovePrompt' }, (engine, e) => {
    const { Box } = engine.ui.resolve(e)
    return h(Box, {}) as RenderElement
  })

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.command.run(typed('skill-usage'))
  const ui = await $.ui.mount({
    plugin: 'skill-usage',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 20,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
  })

  expect(await ui.find({ type: 'Text', text: /No skill invocations yet/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^total$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /per 100 prompts/ })).toBeUndefined()
  await ui.unmount()
})
