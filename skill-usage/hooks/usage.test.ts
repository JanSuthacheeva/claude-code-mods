import { expect, test } from 'claude-code/testing'

import { emptyUsage, parseUsage, rankedSkills, serializeUsage, withCount, withInvocation } from './usage'

const now = Date.parse('2026-10-10T08:00:00.000Z')

test('starts empty when the file is missing, unreadable or not an object', () => {
  const empty = emptyUsage(now)

  expect(parseUsage(null, now)).toEqual(empty)
  expect(parseUsage('{ not json', now)).toEqual(empty)
  expect(parseUsage('[1, 2]', now)).toEqual(empty)
  expect(empty).toEqual({ since: '2026-10-10T08:00:00.000Z', sessions: 0, prompts: 0, turns: 0, skills: {} })
})

test('reads back what it writes and fills in missing fields', () => {
  const usage = withCount(withInvocation(emptyUsage(now), 'commit', 'user', now), 'turns')

  expect(parseUsage(serializeUsage(usage), now)).toEqual(usage)
  expect(parseUsage('{"turns": 4}', now)).toEqual({ ...emptyUsage(now), turns: 4 })
})

test('counts sessions, prompts and turns without touching the input', () => {
  const usage = emptyUsage(now)
  const counted = withCount(withCount(withCount(usage, 'sessions'), 'prompts'), 'prompts')

  expect(counted).toEqual({ ...usage, sessions: 1, prompts: 2 })
  expect(usage.prompts).toBe(0)
})

test('counts each invocation by its source and stamps when it was last used', () => {
  const later = now + 60_000
  const usage = withInvocation(withInvocation(emptyUsage(now), 'commit', 'claude', now), 'commit', 'user', later)

  expect(usage.skills['commit']).toEqual({ user: 1, claude: 1, preload: 0, lastUsed: new Date(later).toISOString() })
})

test('ranks skills by user and claude invocations and leaves out preloads', () => {
  let usage = emptyUsage(now)
  usage = withInvocation(usage, 'brainstorming', 'claude', now)
  usage = withInvocation(usage, 'commit', 'user', now)
  usage = withInvocation(usage, 'commit', 'claude', now)
  usage = withInvocation(usage, 'code-review', 'user', now)
  usage = withInvocation(usage, 'using-superpowers', 'preload', now)

  expect(rankedSkills(usage).map(skill => [skill.name, skill.total])).toEqual([
    ['commit', 2],
    ['brainstorming', 1],
    ['code-review', 1],
  ])
})
