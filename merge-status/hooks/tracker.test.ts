import { expect, test } from 'claude-code/testing'

import { installFakeHost, pipelineUrl, startSession, statusLine } from './fake-host'
import type { FakeMergeRequest, FakeRepo } from './fake-host'

const minute = 60_000

function repoWith(...mergeRequests: FakeMergeRequest[]): FakeRepo {
  return {
    branch: 'feature/x',
    remoteUrl: 'git@gitlab.example.com:team/repo.git',
    upstreamShas: { 'feature/x': 'f1', develop: 'd1' },
    mergeRequests: { 'feature/x': mergeRequests, develop: [] },
  }
}

function openMergeRequest(overrides: Partial<FakeMergeRequest> = {}): FakeMergeRequest {
  return { iid: 1, state: 'opened', targetBranch: 'develop', sha: 'f1', pipeline: null, ...overrides }
}

test('polls only the running pipeline until it passes, then only rechecks the list', async ($, on) => {
  const running = openMergeRequest({ pipeline: { id: 10, status: 'running', sha: 'f1' } })
  const passed = openMergeRequest({ iid: 2, targetBranch: 'main', pipeline: { id: 20, status: 'success', sha: 'f1' } })
  const host = installFakeHost(on, repoWith(running, passed))
  await startSession($, host)
  expect(host.glabCalls).toHaveLength(3)

  host.glabCalls.length = 0
  await host.clock.advance(30_000)
  expect(host.glabCalls).toEqual(['glab api projects/9/merge_requests/1'])

  running.pipeline = { id: 10, status: 'success', sha: 'f1' }
  await host.clock.advance(30_000)
  expect(await statusLine($)).toContain('develop ✓')

  host.glabCalls.length = 0
  await host.clock.advance(10 * minute)
  expect(host.glabCalls.every(call => call.startsWith('glab mr list'))).toBe(true)
  expect(host.glabCalls).toHaveLength(5)
})

test('after a push to a passed MR, waits for the new pipeline instead of keeping the old pass', async ($, on) => {
  const mr = openMergeRequest({ pipeline: { id: 10, status: 'success', sha: 'f1' } })
  const host = installFakeHost(on, repoWith(mr))
  await startSession($, host)
  expect(await statusLine($)).toContain('✓')

  host.repo.upstreamShas['feature/x'] = 'f2'
  await host.clock.advance(15_000)
  expect(await statusLine($)).toContain('⟳')

  mr.sha = 'f2'
  mr.pipeline = { id: 11, status: 'running', sha: 'f2' }
  await host.clock.advance(30_000)
  expect(await statusLine($)).toContain('⟳')

  mr.pipeline = { id: 11, status: 'success', sha: 'f2' }
  await host.clock.advance(30_000)
  expect(await statusLine($)).toContain('✓')
})

test('drops an MR merged while on another branch once you switch back', async ($, on) => {
  const toDevelop = openMergeRequest({ iid: 1 })
  const toSprint = openMergeRequest({ iid: 2, targetBranch: 'sprint-33-2' })
  const host = installFakeHost(on, repoWith(toDevelop, toSprint))
  await startSession($, host)
  expect(await statusLine($)).toContain('!1')

  host.repo.branch = 'develop'
  await host.clock.advance(15_000)
  expect(await statusLine($)).toContain('none')

  toDevelop.state = 'merged'
  host.repo.branch = 'feature/x'
  await host.clock.advance(15_000)
  expect(await statusLine($)).not.toContain('!1')
  expect(await statusLine($)).toContain('!2')
})

test('rechecks open MRs every 2 minutes and drops ones merged elsewhere', async ($, on) => {
  const mr = openMergeRequest({ pipeline: { id: 10, status: 'success', sha: 'f1' } })
  const host = installFakeHost(on, repoWith(mr))
  await startSession($, host)

  host.glabCalls.length = 0
  await host.clock.advance(2 * minute)
  expect(host.glabCalls).toEqual(['glab mr list --source-branch feature/x --all --output json --per-page 20'])

  mr.state = 'merged'
  await host.clock.advance(2 * minute)
  expect(await statusLine($)).toContain('none')
})

test('asks the session to investigate once when a running pipeline fails', async ($, on) => {
  const mr = openMergeRequest({ pipeline: { id: 500, status: 'running', sha: 'f1' } })
  const host = installFakeHost(on, repoWith(mr))
  await startSession($, host)
  expect(host.prompts).toEqual([])

  mr.pipeline = { id: 500, status: 'failed', sha: 'f1' }
  await host.clock.advance(30_000)
  expect(host.prompts).toHaveLength(1)
  expect(host.prompts[0]).toContain(`${pipelineUrl(500)} of MR !1 (feature/x → develop) just failed`)

  await host.clock.advance(10 * minute)
  expect(host.prompts).toHaveLength(1)
})
