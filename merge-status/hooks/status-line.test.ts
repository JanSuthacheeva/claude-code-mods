import { expect, test } from 'claude-code/testing'

import type { BranchStatus, MergeRequest } from '../types'
import { mergeRequest } from './fixtures'
import { github } from './github'
import { gitlab } from './gitlab'
import { statusSegments } from './status-line'

function lineFor(status: Partial<BranchStatus>): string | null {
  const base: BranchStatus = { repo: '/repo', branch: 'feature/x', forge: 'gitlab', mergeRequests: [], error: null }
  const segments = statusSegments({ ...base, ...status })
  return segments?.map(segment => segment.text).join('') ?? null
}

function lineWith(...mergeRequests: MergeRequest[]): string | null {
  return lineFor({ mergeRequests })
}

test('shows each open MR with its target and signs', () => {
  const develop = mergeRequest({ number: 8, pipeline: { status: 'failed', id: '1', url: '' }, hasConflicts: true })
  const sprint = mergeRequest({ number: 7, isDraft: true, targetBranch: 'sprint-33' })

  expect(lineWith(develop, sprint)).toBe(`${gitlab.logo} !8 open → develop ✗ ⚠ · !7 draft → sprint-33 ○`)
})

test('shows GitHub pull requests with the GitHub logo and # numbers', () => {
  const main = mergeRequest({ number: 128, targetBranch: 'main', pipeline: { status: 'running', id: 'abc', url: '' } })

  expect(lineFor({ forge: 'github', mergeRequests: [main] })).toBe(`${github.logo} #128 open → main ⟳`)
})

test('maps every pipeline state to one sign', () => {
  const signFor = (pipeline: MergeRequest['pipeline']): string | undefined =>
    lineWith(mergeRequest({ number: 1, pipeline }))?.slice(-1)

  expect(signFor({ status: 'passed', id: '1', url: '' })).toBe('✓')
  expect(signFor({ status: 'running', id: '1', url: '' })).toBe('⟳')
  expect(signFor({ status: 'awaiting' })).toBe('⟳')
  expect(signFor({ status: 'failed', id: '1', url: '' })).toBe('✗')
  expect(signFor({ status: 'canceled', id: '1', url: '' })).toBe('✗')
  expect(signFor({ status: 'idle', id: '1', url: '' })).toBe('○')
  expect(signFor(null)).toBe('○')
})

test('says none, loading or the error, and nothing outside a forge branch', () => {
  expect(lineFor({ mergeRequests: [] })).toBe(`${gitlab.logo} none`)
  expect(lineFor({ mergeRequests: null })).toBe(`${gitlab.logo} loading...`)
  expect(lineFor({ error: 'glab: not logged in\ndetails' })).toBe(`${gitlab.logo} glab: not logged in`)
  expect(lineFor({ branch: null })).toBeNull()
  expect(lineFor({ forge: null })).toBeNull()
})

test('links each MR number to its page', () => {
  const segments = statusSegments({
    repo: '/repo',
    branch: 'x',
    forge: 'gitlab',
    mergeRequests: [mergeRequest({ number: 8 })],
    error: null,
  })

  expect(segments?.find(segment => segment.text === '!8')?.href).toBe('https://git.example/mr/8')
})
