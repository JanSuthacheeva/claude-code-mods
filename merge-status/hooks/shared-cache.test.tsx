import { expect, test } from 'claude-code/testing'

import { cacheFolder, clearSession, installFakeHost, remoteUrls, startSession, statusLine } from './fake-host'
import type { FakeRepo } from './fake-host'

function repoWithOneMergeRequest(): FakeRepo {
  return {
    branch: 'feature/x',
    remoteUrl: remoteUrls.gitlab,
    upstreamShas: { 'feature/x': 'f1' },
    mergeRequests: {
      'feature/x': [
        {
          number: 1,
          state: 'open',
          targetBranch: 'develop',
          sha: 'f1',
          pipeline: { id: 10, status: 'success', sha: 'f1' },
        },
      ],
    },
  }
}

test('a session starting next to another reuses its answers instead of asking the forge', async ($, on) => {
  const host = installFakeHost(on, repoWithOneMergeRequest())
  await startSession($, host)
  const row = await statusLine($)
  const asked = host.forgeCalls.length
  expect(asked).toBe(2)
  expect([...host.files.keys()].every(path => path.startsWith(`${cacheFolder}/`))).toBe(true)
  expect(host.files.size).toBe(2)

  await clearSession($, host)
  await host.clock.advance(15_000)

  expect(host.forgeCalls).toHaveLength(asked)
  expect(await statusLine($)).toBe(row)
})

test('asks again once the shared answer is older than its age', async ($, on) => {
  const host = installFakeHost(on, repoWithOneMergeRequest())
  await startSession($, host)
  const asked = host.forgeCalls.length

  await host.clock.advance(101_000)
  await clearSession($, host)

  expect(host.forgeCalls.length).toBeGreaterThan(asked)
})

test('a push asks the forge afresh, whatever another session saw', async ($, on) => {
  const host = installFakeHost(on, repoWithOneMergeRequest())
  await startSession($, host)
  const asked = host.forgeCalls.length

  host.repo.upstreamShas['feature/x'] = 'f2'
  await host.clock.advance(15_000)

  expect(host.forgeCalls.length).toBeGreaterThan(asked)
})

test('shares no failure, so the next session asks again', async ($, on) => {
  const host = installFakeHost(on, { ...repoWithOneMergeRequest(), forgeFailure: '401 Unauthorized' })
  await startSession($, host)

  expect(host.files.size).toBe(0)
})
