import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { installFakeHost, mergeRequestUrl, startSession, statusLine } from './fake-host'
import type { FakeRepo } from './fake-host'
import { notLoggedInMessage } from './gitlab'
import { logo } from './status-line'

function repoWithTwoMergeRequests(): FakeRepo {
  return {
    branch: 'feature/x',
    remoteUrl: 'git@gitlab.example.com:team/repo.git',
    upstreamShas: { 'feature/x': 'f1' },
    mergeRequests: {
      'feature/x': [
        { iid: 3610, state: 'opened', isDraft: true, targetBranch: 'sprint-33-2', sha: 'f1', pipeline: null },
        {
          iid: 3609,
          state: 'opened',
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

test('adds the open MRs on a row under the engine hint, and /mrs toggles it', async ($, on) => {
  const host = installFakeHost(on, repoWithTwoMergeRequests())
  await startSession($, host)

  expect(await statusLine($)).toBe(`${logo} !3609 open → develop ✗ ⚠ · !3610 draft → sprint-33-2 ○`)

  expect(await runCommand($, 'mrs')).toBe('MRs hidden.')
  expect(await statusLine($)).toBeNull()

  expect(await runCommand($, 'mrs')).toBe('MRs shown.')
  expect(await statusLine($)).not.toBeNull()
})

test('leaves the hint alone outside GitLab repos', async ($, on) => {
  const host = installFakeHost(on, { ...repoWithTwoMergeRequests(), remoteUrl: 'git@github.com:me/repo.git' })
  await startSession($, host)

  expect(await statusLine($)).toBeNull()
  expect(host.glabCalls).toEqual([])
})

test('/mr opens the picked MR in the browser', async ($, on) => {
  const host = installFakeHost(on, repoWithTwoMergeRequests())
  await startSession($, host)

  expect(await runCommand($, 'mr')).toBe('Opened !3609.')
  expect(await runCommand($, 'mr', '3610')).toBe('Opened !3610.')
  expect(await runCommand($, 'mr', '9')).toBe('No MR "9" here. Open: !3609, !3610')
  expect(host.openedWith).toEqual([
    ['open', mergeRequestUrl(3609)],
    ['open', mergeRequestUrl(3610)],
  ])
})

test('/mr opens links with xdg-open on Linux', async ($, on) => {
  const host = installFakeHost(on, { ...repoWithTwoMergeRequests(), platform: 'linux' })
  await startSession($, host)
  await runCommand($, 'mr')

  expect(host.openedWith).toEqual([['xdg-open', mergeRequestUrl(3609)]])
})

test('/mr opens links with the URL protocol handler on Windows', async ($, on) => {
  const host = installFakeHost(on, { ...repoWithTwoMergeRequests(), platform: 'windows' })
  await startSession($, host)
  await runCommand($, 'mr')

  expect(host.openedWith).toEqual([['rundll32', 'url.dll,FileProtocolHandler', mergeRequestUrl(3609)]])
})

test('tells you to log in when glab is not authenticated', async ($, on) => {
  const glabFailure =
    '   ERROR\n\n  None of the git remotes point to a known GitLab host. Please use `glab auth login`.'
  const host = installFakeHost(on, { ...repoWithTwoMergeRequests(), glabFailure })
  await startSession($, host)

  expect(await statusLine($)).toBe(`${logo} ${notLoggedInMessage}`)
})
