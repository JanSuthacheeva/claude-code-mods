import { expect, mock, test } from 'claude-code/testing'

import type { ForgeName } from '../types'
import { installFakeHost, pipelineUrl, projects, remoteUrls, startSession, statusLine } from './fake-host'
import type { FakeMergeRequest, FakeRepo } from './fake-host'
import { mergeRequest } from './fixtures'
import { forgeNamed } from './forge'

const minute = 60_000

const forges: ForgeName[] = ['gitlab', 'github']

function repoWith(forge: ForgeName, ...mergeRequests: FakeMergeRequest[]): FakeRepo {
  return {
    branch: 'feature/x',
    remoteUrl: remoteUrls[forge],
    upstreamShas: { 'feature/x': 'f1', develop: 'd1' },
    mergeRequests: { 'feature/x': mergeRequests, develop: [] },
  }
}

function openMergeRequest(overrides: Partial<FakeMergeRequest> = {}): FakeMergeRequest {
  return { number: 1, state: 'open', targetBranch: 'develop', sha: 'f1', pipeline: null, ...overrides }
}

for (const name of forges) {
  const forge = forgeNamed(name)
  const label = (number: number): string => `${forge.sigil}${String(number)}`

  test(`${name}: polls only the running pipeline until it passes, then only rechecks the list`, async ($, on) => {
    const running = openMergeRequest({ pipeline: { id: 10, status: 'running', sha: 'f1' } })
    const passed = openMergeRequest({
      number: 2,
      targetBranch: 'main',
      pipeline: { id: 20, status: 'success', sha: 'f1' },
    })
    const host = installFakeHost(on, repoWith(name, running, passed))
    await startSession($, host)
    expect(host.forgeCalls).toHaveLength(3)

    host.forgeCalls.length = 0
    await host.clock.advance(30_000)
    expect(host.forgeCalls).toEqual([forge.detailsArgv(mergeRequest({ number: 1, project: projects[name] })).join(' ')])

    running.pipeline = { id: 10, status: 'success', sha: 'f1' }
    await host.clock.advance(30_000)
    expect(await statusLine($)).toContain('develop ✓')

    host.forgeCalls.length = 0
    await host.clock.advance(10 * minute)
    expect(host.forgeCalls.every(call => call === forge.listArgv('feature/x').join(' '))).toBe(true)
    expect(host.forgeCalls).toHaveLength(5)
  })

  test(`${name}: after a push to a passed MR, waits for the new pipeline instead of keeping the old pass`, async ($, on) => {
    const mr = openMergeRequest({ pipeline: { id: 10, status: 'success', sha: 'f1' } })
    const host = installFakeHost(on, repoWith(name, mr))
    await startSession($, host)
    expect(await statusLine($)).toContain('✓')

    host.repo.upstreamShas['feature/x'] = 'f2'
    await host.clock.advance(15_000)
    expect(await statusLine($)).toContain('⟳')

    mr.sha = 'f2'
    await host.clock.advance(30_000)
    expect(await statusLine($)).toContain('⟳')

    mr.pipeline = { id: 11, status: 'running', sha: 'f2' }
    await host.clock.advance(30_000)
    expect(await statusLine($)).toContain('⟳')

    mr.pipeline = { id: 11, status: 'success', sha: 'f2' }
    await host.clock.advance(30_000)
    expect(await statusLine($)).toContain('✓')
  })

  test(`${name}: drops an MR merged while on another branch once you switch back`, async ($, on) => {
    const toDevelop = openMergeRequest({ number: 1 })
    const toSprint = openMergeRequest({ number: 2, targetBranch: 'sprint-33-2' })
    const host = installFakeHost(on, repoWith(name, toDevelop, toSprint))
    await startSession($, host)
    expect(await statusLine($)).toContain(label(1))

    host.repo.branch = 'develop'
    await host.clock.advance(15_000)
    expect(await statusLine($)).toContain('none')

    toDevelop.state = 'merged'
    host.repo.branch = 'feature/x'
    await host.clock.advance(15_000)
    expect(await statusLine($)).not.toContain(label(1))
    expect(await statusLine($)).toContain(label(2))
  })

  test(`${name}: rechecks open MRs every 2 minutes and drops ones merged elsewhere`, async ($, on) => {
    const mr = openMergeRequest({ pipeline: { id: 10, status: 'success', sha: 'f1' } })
    const host = installFakeHost(on, repoWith(name, mr))
    await startSession($, host)

    host.forgeCalls.length = 0
    await host.clock.advance(2 * minute)
    expect(host.forgeCalls).toEqual([forge.listArgv('feature/x').join(' ')])

    mr.state = 'merged'
    await host.clock.advance(2 * minute)
    expect(await statusLine($)).toContain('none')
  })

  test(`${name}: asks the session to investigate once when a running pipeline fails`, async ($, on) => {
    const mr = openMergeRequest({ pipeline: { id: 500, status: 'running', sha: 'f1' } })
    const host = installFakeHost(on, repoWith(name, mr))
    await startSession($, host)
    expect(host.prompts).toEqual([])

    mr.pipeline = { id: 500, status: 'failed', sha: 'f1' }
    await host.clock.advance(30_000)
    expect(host.prompts).toHaveLength(1)
    expect(host.prompts[0]).toContain(`${label(1)} (feature/x → develop)`)
    expect(host.prompts[0]).toContain(pipelineUrl(name, mr))

    await host.clock.advance(10 * minute)
    expect(host.prompts).toHaveLength(1)
  })

  test(
    `${name}: tells Claude once when a running pipeline passes, without starting a turn`,
    { options: { notifyOnPass: true } },
    async ($, on) => {
      const session = mock.session(on)
      const mr = openMergeRequest({ pipeline: { id: 600, status: 'running', sha: 'f1' } })
      const host = installFakeHost(on, repoWith(name, mr))
      await startSession($, host)

      mr.pipeline = { id: 600, status: 'success', sha: 'f1' }
      await host.clock.advance(30_000)
      await host.clock.advance(10 * minute)

      const notes = session.appended().map(row => JSON.stringify(row.message.content))
      expect(notes).toHaveLength(1)
      expect(notes[0]).toContain(`${label(1)} (feature/x → develop) passed`)
      expect(host.prompts).toEqual([])
    },
  )

  test(`${name}: keeps quiet about a passed pipeline while notifyOnPass is off`, async ($, on) => {
    const session = mock.session(on)
    const mr = openMergeRequest({ pipeline: { id: 600, status: 'running', sha: 'f1' } })
    const host = installFakeHost(on, repoWith(name, mr))
    await startSession($, host)

    mr.pipeline = { id: 600, status: 'success', sha: 'f1' }
    await host.clock.advance(30_000)
    expect(await statusLine($)).toContain('✓')
    expect(session.appended()).toEqual([])
  })
}
