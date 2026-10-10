import type { CommandInfo } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { initialAttribution, isSameSkill, sourceOf, typedCommandOf, typedSkillOf } from './attribution'

test('reads the slash command a prompt starts with', () => {
  expect(typedCommandOf('/commit fix the readme')).toBe('commit')
  expect(typedCommandOf('  /superpowers:brainstorming')).toBe('superpowers:brainstorming')
  expect(typedCommandOf('please /commit')).toBeNull()
  expect(typedCommandOf('/')).toBeNull()
})

test('matches skills by name, with or without a plugin prefix or slash', () => {
  expect(isSameSkill('brainstorming', 'superpowers:brainstorming')).toBe(true)
  expect(isSameSkill('/commit', 'commit')).toBe(true)
  expect(isSameSkill('commit', 'code-review')).toBe(false)
})

test('attributes a skill to claude inside a Skill tool call', () => {
  const attribution = { ...initialAttribution(), pendingSkillCalls: 1, typedCommand: 'commit' }

  expect(sourceOf(attribution, 'commit')).toBe('claude')
})

test('attributes a skill to the user when it matches the typed command', () => {
  const attribution = { ...initialAttribution(), typedCommand: 'brainstorming' }

  expect(sourceOf(attribution, 'superpowers:brainstorming')).toBe('user')
})

test('counts any other expanded skill as a preload', () => {
  expect(sourceOf(initialAttribution(), 'commit')).toBe('preload')
  expect(sourceOf({ ...initialAttribution(), typedCommand: 'clear' }, 'commit')).toBe('preload')
})

test('resolves a typed command to a listed skill, never to a built-in or a mod command', () => {
  const commands: CommandInfo[] = [
    { name: 'clear', description: '', source: 'builtin' },
    { name: 'commit', description: '', source: 'user' },
    { name: 'superpowers:brainstorming', description: '', source: 'plugin', plugin: 'superpowers' },
    { name: 'mrs', description: '', source: 'plugin', plugin: 'merge-status' },
    { name: 'github:review', description: '', source: 'mcp' },
  ]

  expect(typedSkillOf('commit', commands)).toBe('commit')
  expect(typedSkillOf('superpowers:brainstorming', commands)).toBe('superpowers:brainstorming')
  expect(typedSkillOf('brainstorming', commands)).toBe('superpowers:brainstorming')
  expect(typedSkillOf('clear', commands)).toBeNull()
  expect(typedSkillOf('mrs', commands)).toBeNull()
  expect(typedSkillOf('review', commands)).toBeNull()
  expect(typedSkillOf('unknown', commands)).toBeNull()
})
