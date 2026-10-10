import { expect, test } from 'claude-code/testing'

import { mergeRequest } from './fixtures'
import {
  describeFailure,
  investigationPrompt,
  notLoggedInMessage,
  parseDetails,
  parseMergeRequests,
  pipelineStatus,
} from './gitlab'
import type { FinishedMergeRequest } from './pipelines'

test('maps the GitLab list payload onto merge requests', () => {
  const payload = JSON.stringify([
    {
      iid: 7,
      project_id: 1,
      state: 'opened',
      draft: true,
      target_branch: 'sprint-33',
      web_url: 'https://git.example/mr/7',
    },
    { iid: 8, project_id: 1, state: 'merged', target_branch: 'develop', web_url: 'https://git.example/mr/8' },
    { iid: 9, project_id: 1, state: 'locked', target_branch: 'develop', web_url: 'https://git.example/mr/9' },
  ])

  expect(parseMergeRequests(payload)).toEqual([
    {
      number: 7,
      project: '1',
      state: 'open',
      isDraft: true,
      targetBranch: 'sprint-33',
      url: 'https://git.example/mr/7',
      pipeline: null,
      hasConflicts: false,
    },
    {
      number: 8,
      project: '1',
      state: 'merged',
      isDraft: false,
      targetBranch: 'develop',
      url: 'https://git.example/mr/8',
      pipeline: null,
      hasConflicts: false,
    },
    {
      number: 9,
      project: '1',
      state: 'closed',
      isDraft: false,
      targetBranch: 'develop',
      url: 'https://git.example/mr/9',
      pipeline: null,
      hasConflicts: false,
    },
  ])
})

test('maps the details payload onto the head pipeline and conflicts', () => {
  const payload = JSON.stringify({
    sha: 'a1',
    has_conflicts: true,
    head_pipeline: { id: 500, status: 'pending', sha: 'a1', web_url: 'https://git.example/p/500' },
  })

  expect(parseDetails(payload)).toEqual({
    sha: 'a1',
    hasConflicts: true,
    headPipeline: { status: 'running', id: '500', sha: 'a1', url: 'https://git.example/p/500' },
  })
  expect(parseDetails(JSON.stringify({ sha: 'a1', has_conflicts: false, head_pipeline: null })).headPipeline).toBeNull()
})

test('maps GitLab pipeline statuses onto running, passed, failed, canceled or idle', () => {
  const running = ['created', 'waiting_for_resource', 'preparing', 'pending', 'running', 'scheduled'] as const

  for (const status of running) expect(pipelineStatus(status)).toBe('running')
  expect(pipelineStatus('success')).toBe('passed')
  expect(pipelineStatus('failed')).toBe('failed')
  expect(pipelineStatus('canceled')).toBe('canceled')
  expect(pipelineStatus('manual')).toBe('idle')
  expect(pipelineStatus('skipped')).toBe('idle')
})

test('explains a logged-out glab instead of echoing its banner', () => {
  const unknownHost = `   ERROR

  None of the git remotes configured for this repository point to a known GitLab host. Please use \`glab auth login\` to
  authenticate and configure a new host for glab.`

  expect(describeFailure(unknownHost)).toBe(notLoggedInMessage)
  expect(describeFailure('glab: 401 Unauthorized (HTTP 401)')).toBe(notLoggedInMessage)
  expect(describeFailure('   ERROR\n\n  404 Project Not Found')).toBe('404 Project Not Found')
})

test('asks to investigate only, with the glab commands to get there', () => {
  const failed: FinishedMergeRequest = {
    ...mergeRequest({ number: 8 }),
    pipeline: { status: 'failed', id: '77', url: 'https://git.example/p/77' },
  }
  const prompt = investigationPrompt(failed, 'feature/x')

  expect(prompt).toContain('https://git.example/p/77 of MR !8 (feature/x → develop) just failed')
  expect(prompt).toContain("glab api 'projects/1/pipelines/77/jobs?scope=failed'")
  expect(prompt).toContain('glab api projects/1/jobs/<job-id>/trace')
  expect(prompt).toContain('do not change code, commit, push or retry')
})
