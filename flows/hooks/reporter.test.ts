import { expect, test } from 'claude-code/testing'

import { createdMergeRequest, phaseOfSkill, reportArgs, reportTextLimit, taskCounts, waitingQuestion } from './reporter'

test('reports a phase when a phase skill starts, also with a plugin prefix', () => {
  expect(reportArgs({ kind: 'skill', skill: 'design-code' })).toEqual(['phase', 'design'])
  expect(reportArgs({ kind: 'skill', skill: 'implement-plan' })).toEqual(['phase', 'implement'])
  expect(reportArgs({ kind: 'skill', skill: 'review-changes' })).toEqual(['phase', 'review'])
  expect(reportArgs({ kind: 'skill', skill: 'buzzwoo-standard:write-merge-request' })).toEqual(['phase', 'merge-request'])
  expect(reportArgs({ kind: 'skill', skill: 'commit' })).toBeNull()
  expect(phaseOfSkill('/design-code')).toBe('design')
})

test('reports delegated, working and waiting around agents, questions and turns', () => {
  expect(reportArgs({ kind: 'delegated', description: 'implement plan' })).toEqual(['delegated', 'implement plan'])
  expect(reportArgs({ kind: 'agent-done' })).toEqual(['working'])
  expect(reportArgs({ kind: 'answered' })).toEqual(['working'])
  expect(reportArgs({ kind: 'turn-start' })).toEqual(['working'])
  expect(reportArgs({ kind: 'question', text: 'Which approach?' })).toEqual(['waiting', 'Which approach?'])
  expect(reportArgs({ kind: 'turn-end', answer: 'Done with the page.\n\nApprove it?\n' })).toEqual(['waiting', 'Approve it?'])
  expect(reportArgs({ kind: 'turn-end', answer: '  \n' })).toEqual(['waiting', 'turn ended'])
})

test('takes the last line of an answer as the question, cut to the limit', () => {
  expect(waitingQuestion('a\nb\n\n')).toBe('b')
  expect(waitingQuestion('')).toBeNull()
  expect(waitingQuestion('x'.repeat(reportTextLimit + 10))?.length).toBe(reportTextLimit)
})

test('reports blocks and task counts from plan-progress reports', () => {
  const report = { kind: 'plan-report', item: '5', note: 'migration needs a default', result: 'ok, 4/9 done' } as const
  expect(reportArgs({ ...report, status: 'blocked' })).toEqual(['blocked', '5: migration needs a default'])
  expect(reportArgs({ ...report, status: 'blocked', note: null })).toEqual(['blocked', '5'])
  expect(reportArgs({ ...report, status: 'done' })).toEqual(['tasks', '4', '9'])
  expect(reportArgs({ ...report, status: 'doing', result: 'something else' })).toBeNull()
})

test('reads every result form plan-progress answers with (plan-progress/hooks/progress.ts summaryLine)', () => {
  expect(taskCounts('ok, 2/3 done - next: 3 Write the README')).toEqual({ done: 2, total: 3 })
  expect(taskCounts('ok, 2/3 done - after this: 3 Write the README')).toEqual({ done: 2, total: 3 })
  expect(taskCounts('ok, 2/3 done - this is the last open item')).toEqual({ done: 2, total: 3 })
  expect(taskCounts('ok, 2/3 done')).toEqual({ done: 2, total: 3 })
  expect(taskCounts('ok, all 9 done - plan complete')).toEqual({ done: 9, total: 9 })
  expect(taskCounts('nothing')).toBeNull()
})

test('reports a merge request when gh or glab created one', () => {
  const url = 'https://gitlab.com/acme/shop/-/merge_requests/88'
  expect(createdMergeRequest('glab mr create --fill', `Creating merge request\n${url}\n`)).toBe(url)
  expect(createdMergeRequest('gh pr create --title x', 'https://github.com/a/b/pull/3\n')).toBe('https://github.com/a/b/pull/3')
  expect(createdMergeRequest('git push', `remote: ${url}`)).toBeNull()
  expect(createdMergeRequest('glab mr create', 'error: no permission')).toBeNull()
  expect(reportArgs({ kind: 'command', command: 'glab mr create', stdout: url })).toEqual(['merge-request', url])
  expect(reportArgs({ kind: 'command', command: 'ls', stdout: '' })).toBeNull()
})

test('reports ended unless the session was only cleared, and heartbeats', () => {
  expect(reportArgs({ kind: 'session-end', reason: 'prompt_input_exit' })).toEqual(['ended'])
  expect(reportArgs({ kind: 'session-end', reason: 'clear' })).toBeNull()
  expect(reportArgs({ kind: 'heartbeat' })).toEqual(['heartbeat'])
})
