import { expect, test } from 'claude-code/testing'

import type { BranchStatus, MergeRequest } from '../types'
import { mergeRequest } from './fixtures'
import { logo, statusSegments } from './status-line'

function lineFor(status: Partial<BranchStatus>): string | null {
  const segments = statusSegments({ repo: '/repo', branch: 'feature/x', mergeRequests: [], error: null, ...status })
  return segments?.map(segment => segment.text).join('') ?? null
}

function lineWith(...mergeRequests: MergeRequest[]): string | null {
  return lineFor({ mergeRequests })
}

test('shows each open MR with its target and signs', () => {
  const develop = mergeRequest({ iid: 8, pipeline: { status: 'failed', id: 1, url: '' }, hasConflicts: true })
  const sprint = mergeRequest({ iid: 7, isDraft: true, targetBranch: 'sprint-33' })

  expect(lineWith(develop, sprint)).toBe(`${logo} !8 open → develop ✗ ⚠ · !7 draft → sprint-33 ○`)
})

test('maps every pipeline state to one sign', () => {
  const signFor = (pipeline: MergeRequest['pipeline']): string | undefined =>
    lineWith(mergeRequest({ iid: 1, pipeline }))?.slice(-1)

  expect(signFor({ status: 'success', id: 1, url: '' })).toBe('✓')
  expect(signFor({ status: 'running', id: 1, url: '' })).toBe('⟳')
  expect(signFor({ status: 'awaiting' })).toBe('⟳')
  expect(signFor({ status: 'canceled', id: 1, url: '' })).toBe('✗')
  expect(signFor({ status: 'skipped', id: 1, url: '' })).toBe('○')
  expect(signFor(null)).toBe('○')
})

test('says none, loading or the error, and nothing outside a GitLab branch', () => {
  expect(lineFor({ mergeRequests: [] })).toBe(`${logo} none`)
  expect(lineFor({ mergeRequests: null })).toBe(`${logo} loading...`)
  expect(lineFor({ error: 'glab: not logged in\ndetails' })).toBe(`${logo} glab: not logged in`)
  expect(lineFor({ branch: null })).toBeNull()
})

test('links each MR number to its page', () => {
  const status = { repo: '/repo', branch: 'x', mergeRequests: [mergeRequest({ iid: 8 })], error: null }
  const segments = statusSegments(status)

  expect(segments?.find(segment => segment.text === '!8')?.href).toBe('https://git.example/mr/8')
})
