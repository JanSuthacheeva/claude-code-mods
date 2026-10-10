import { expect, test } from 'claude-code/testing'

import { mergeRequest } from './fixtures'
import {
  describeFailure,
  detailsArgv,
  investigationPrompt,
  notLoggedInMessage,
  parseDetails,
  parsePullRequests,
  rollupStatus,
} from './github'
import type { ApiCheck } from './github'
import type { FinishedMergeRequest } from './pipelines'

const prUrl = 'https://github.com/team/repo/pull/12'

function checkRun(status: string, conclusion: string | null = null): ApiCheck {
  return { __typename: 'CheckRun', status, conclusion } as ApiCheck
}

function statusContext(state: string): ApiCheck {
  return { __typename: 'StatusContext', state } as ApiCheck
}

const passed = checkRun('COMPLETED', 'SUCCESS')

test('maps the gh list payload onto merge requests, with the host-qualified repo as project', () => {
  const payload = JSON.stringify([
    { number: 12, state: 'OPEN', isDraft: true, baseRefName: 'main', url: prUrl },
    { number: 9, state: 'MERGED', isDraft: false, baseRefName: 'develop', url: 'https://github.acme.com/a/b/pull/9' },
  ])

  expect(parsePullRequests(payload)).toEqual([
    {
      number: 12,
      project: 'github.com/team/repo',
      state: 'open',
      isDraft: true,
      targetBranch: 'main',
      url: prUrl,
      pipeline: null,
      hasConflicts: false,
    },
    {
      number: 9,
      project: 'github.acme.com/a/b',
      state: 'merged',
      isDraft: false,
      targetBranch: 'develop',
      url: 'https://github.acme.com/a/b/pull/9',
      pipeline: null,
      hasConflicts: false,
    },
  ])
})

test('views a pull request in its own repository', () => {
  const pr = mergeRequest({ number: 12, project: 'github.com/team/repo' })

  expect(detailsArgv(pr)).toEqual([
    'gh',
    'pr',
    'view',
    '12',
    '--repo',
    'github.com/team/repo',
    '--json',
    'headRefOid,mergeable,statusCheckRollup,url',
  ])
})

test('rolls the head commit checks up into one pipeline: running, then failed, then canceled, then passed', () => {
  expect(rollupStatus([])).toBeNull()
  expect(rollupStatus([passed, checkRun('IN_PROGRESS'), checkRun('COMPLETED', 'FAILURE')])).toBe('running')
  expect(rollupStatus([passed, checkRun('QUEUED')])).toBe('running')
  expect(rollupStatus([passed, statusContext('PENDING')])).toBe('running')
  expect(rollupStatus([passed, statusContext('EXPECTED')])).toBe('running')
  expect(rollupStatus([passed, checkRun('COMPLETED', 'CANCELLED'), checkRun('COMPLETED', 'TIMED_OUT')])).toBe('failed')
  expect(rollupStatus([passed, checkRun('COMPLETED', 'STARTUP_FAILURE')])).toBe('failed')
  expect(rollupStatus([passed, checkRun('COMPLETED', 'ACTION_REQUIRED')])).toBe('failed')
  expect(rollupStatus([passed, statusContext('ERROR')])).toBe('failed')
  expect(rollupStatus([passed, statusContext('FAILURE')])).toBe('failed')
  expect(rollupStatus([passed, checkRun('COMPLETED', 'CANCELLED')])).toBe('canceled')
  expect(rollupStatus([passed, checkRun('COMPLETED', 'SKIPPED'), checkRun('COMPLETED', 'NEUTRAL')])).toBe('passed')
  expect(rollupStatus([statusContext('SUCCESS'), checkRun('COMPLETED', 'STALE')])).toBe('passed')
})

test('maps the details payload onto the head commit pipeline and conflicts', () => {
  const payload = {
    headRefOid: 'abc1234def',
    mergeable: 'CONFLICTING',
    statusCheckRollup: [checkRun('COMPLETED', 'FAILURE')],
    url: prUrl,
  }

  expect(parseDetails(JSON.stringify(payload))).toEqual({
    sha: 'abc1234def',
    hasConflicts: true,
    headPipeline: { status: 'failed', id: 'abc1234def', sha: 'abc1234def', url: `${prUrl}/checks` },
  })
  expect(parseDetails(JSON.stringify({ ...payload, mergeable: 'UNKNOWN', statusCheckRollup: [] }))).toEqual({
    sha: 'abc1234def',
    hasConflicts: false,
    headPipeline: null,
  })
})

test('explains a logged-out gh instead of echoing its output', () => {
  const loggedOut = 'To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN'

  expect(describeFailure(loggedOut)).toBe(notLoggedInMessage)
  expect(describeFailure('HTTP 401: Bad credentials (https://api.github.com/graphql)')).toBe(notLoggedInMessage)
  expect(describeFailure('\nGraphQL: Could not resolve to a Repository\n')).toBe(
    'GraphQL: Could not resolve to a Repository',
  )
  expect(describeFailure('')).toBe('gh failed')
})

test('asks to investigate only, with the gh commands to get there', () => {
  const failed: FinishedMergeRequest = {
    ...mergeRequest({ number: 12, project: 'github.com/team/repo', targetBranch: 'main' }),
    pipeline: { status: 'failed', id: 'abc1234def', url: `${prUrl}/checks` },
  }
  const prompt = investigationPrompt(failed, 'feature/x')

  expect(prompt).toContain(`PR #12 (feature/x → main) on commit abc1234 just failed: ${prUrl}/checks`)
  expect(prompt).toContain('gh pr checks 12 --repo github.com/team/repo')
  expect(prompt).toContain('gh run view <run-id> --repo github.com/team/repo --log-failed')
  expect(prompt).toContain('do not change code, commit, push or re-run')
})
