import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { ForgeName } from '../types'
import { installFakeHost, mergeRequestUrl, remoteUrls, startSession, statusLine } from './fake-host'
import type { FakeRepo } from './fake-host'
import { forgeNamed } from './forge'
import { github } from './github'
import { gitlab } from './gitlab'

const forges: ForgeName[] = ['gitlab', 'github']

function repoWithTwoMergeRequests(forge: ForgeName): FakeRepo {
  return {
    branch: 'feature/x',
    remoteUrl: remoteUrls[forge],
    upstreamShas: { 'feature/x': 'f1' },
    mergeRequests: {
      'feature/x': [
        { number: 3610, state: 'open', isDraft: true, targetBranch: 'sprint-33-2', sha: 'f1', pipeline: null },
        {
          number: 3609,
          state: 'open',
          targetBranch: 'develop',
          sha: 'f1',
          pipeline: { id: 1, status: 'failed', sha: 'f1' },
          hasConflicts: true,
        },
      ],
    },
  }
}

async function runCommand($: Engine, command: string, args = ''): Promise<string | undefined> {
  const result = await $.command.run({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  return result.text
}

for (const name of forges) {
  const forge = forgeNamed(name)
  const label = (number: number): string => `${forge.sigil}${String(number)}`

  test(`${name}: adds the open MRs on a row under the engine hint, and /mrs toggles it`, async ($, on) => {
    const host = installFakeHost(on, repoWithTwoMergeRequests(name))
    await startSession($, host)

    expect(await statusLine($)).toBe(
      `${forge.logo} ${label(3609)} open → develop ✗ ⚠ · ${label(3610)} draft → sprint-33-2 ○`,
    )

    expect(await runCommand($, 'mrs')).toBe('MRs hidden.')
    expect(await statusLine($)).toBeNull()

    expect(await runCommand($, 'mrs')).toBe('MRs shown.')
    expect(await statusLine($)).not.toBeNull()
  })

  test(`${name}: /mr opens the picked MR in the browser`, async ($, on) => {
    const host = installFakeHost(on, repoWithTwoMergeRequests(name))
    await startSession($, host)

    expect(await runCommand($, 'mr')).toBe(`Opened ${label(3609)}.`)
    expect(await runCommand($, 'mr', label(3610))).toBe(`Opened ${label(3610)}.`)
    expect(await runCommand($, 'mr', '9')).toBe(`No ${forge.noun} "9" here. Open: ${label(3609)}, ${label(3610)}`)
    expect(host.openedWith).toEqual([
      ['open', mergeRequestUrl(name, 3609)],
      ['open', mergeRequestUrl(name, 3610)],
    ])
  })

  test(`${name}: /mr says when the branch has nothing open`, async ($, on) => {
    const host = installFakeHost(on, { ...repoWithTwoMergeRequests(name), mergeRequests: {} })
    await startSession($, host)

    expect(await runCommand($, 'mr')).toBe(`No open ${forge.noun} for this branch.`)
  })
}

test('leaves the hint alone outside a repository with a remote host', async ($, on) => {
  const host = installFakeHost(on, { ...repoWithTwoMergeRequests('gitlab'), remoteUrl: '/srv/git/repo.git' })
  await startSession($, host)

  expect(await statusLine($)).toBeNull()
  expect(host.forgeCalls).toEqual([])
})

test('asks gh on GitHub and glab anywhere else', async ($, on) => {
  const host = installFakeHost(on, repoWithTwoMergeRequests('github'))
  await startSession($, host)

  expect(host.forgeCalls.every(call => call.startsWith('gh pr '))).toBe(true)
  expect(host.forgeCalls).toHaveLength(3)
})

test('/mr opens links with xdg-open on Linux', async ($, on) => {
  const host = installFakeHost(on, { ...repoWithTwoMergeRequests('gitlab'), platform: 'linux' })
  await startSession($, host)
  await runCommand($, 'mr')

  expect(host.openedWith).toEqual([['xdg-open', mergeRequestUrl('gitlab', 3609)]])
})

test('/mr opens links with the URL protocol handler on Windows', async ($, on) => {
  const host = installFakeHost(on, { ...repoWithTwoMergeRequests('gitlab'), platform: 'windows' })
  await startSession($, host)
  await runCommand($, 'mr')

  expect(host.openedWith).toEqual([['rundll32', 'url.dll,FileProtocolHandler', mergeRequestUrl('gitlab', 3609)]])
})

test('tells you to log in when glab is not authenticated', async ($, on) => {
  const forgeFailure =
    '   ERROR\n\n  None of the git remotes point to a known GitLab host. Please use `glab auth login`.'
  const host = installFakeHost(on, { ...repoWithTwoMergeRequests('gitlab'), forgeFailure })
  await startSession($, host)

  expect(await statusLine($)).toBe(`${gitlab.logo} ${gitlab.notLoggedInMessage}`)
})

test('tells you to log in when gh is not authenticated', async ($, on) => {
  const forgeFailure = 'To get started with GitHub CLI, please run:  gh auth login'
  const host = installFakeHost(on, { ...repoWithTwoMergeRequests('github'), forgeFailure })
  await startSession($, host)

  expect(await statusLine($)).toBe(`${github.logo} ${github.notLoggedInMessage}`)
})
