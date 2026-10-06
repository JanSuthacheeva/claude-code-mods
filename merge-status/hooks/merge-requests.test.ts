import { expect, test } from 'claude-code/testing'

import { mergeRequest } from './fixtures'
import { openByPriority, pickMergeRequest } from './merge-requests'

test('keeps open MRs ordered by target: other branches, develop, sprint, main', () => {
  const targets = ['main', 'sprint-33', 'develop', 'feature/ABC-1-base', 'sprint-34', 'bugfix/x']
  const mergeRequests = [
    ...targets.map((targetBranch, index) => mergeRequest({ number: index + 1, targetBranch })),
    mergeRequest({ number: 99, targetBranch: 'feature/merged', state: 'merged' }),
  ]

  expect(openByPriority(mergeRequests).map(mr => mr.targetBranch)).toEqual([
    'bugfix/x',
    'feature/ABC-1-base',
    'develop',
    'sprint-34',
    'sprint-33',
    'main',
  ])
})

test('picks an MR by position or by number, with or without its sign', () => {
  const mergeRequests = [mergeRequest({ number: 8 }), mergeRequest({ number: 7 })]

  expect(pickMergeRequest(mergeRequests, '')?.number).toBe(8)
  expect(pickMergeRequest(mergeRequests, '2')?.number).toBe(7)
  expect(pickMergeRequest(mergeRequests, '7')?.number).toBe(7)
  expect(pickMergeRequest(mergeRequests, '!8')?.number).toBe(8)
  expect(pickMergeRequest(mergeRequests, '#7')?.number).toBe(7)
  expect(pickMergeRequest(mergeRequests, '3')).toBeUndefined()
  expect(pickMergeRequest(mergeRequests, 'abc')).toBeUndefined()
})
