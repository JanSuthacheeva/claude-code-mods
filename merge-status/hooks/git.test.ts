import { expect, test } from 'claude-code/testing'

import { isTriggeringCommand, remoteBranchName, remoteHost } from './git'

test('triggers on checkout, switch, push, pull and MR creation only', () => {
  const triggering = [
    'git checkout develop',
    'git switch -c x',
    'git push -u origin x',
    'git -C /repo pull',
    'cd a && git push',
    'glab mr create --fill',
    'gh pr create --fill',
    'gh pr new',
  ]
  const ignored = [
    'git status',
    'git log --oneline',
    'glab mr list',
    'gh pr list',
    'git commit -m "push docs"',
    'echo checkout',
  ]

  for (const command of triggering) expect(isTriggeringCommand(command)).toBe(true)
  for (const command of ignored) expect(isTriggeringCommand(command)).toBe(false)
})

test('names the remote branch after the upstream, falling back to the local one', () => {
  expect(remoteBranchName('origin/feature/x', 'local')).toBe('feature/x')
  expect(remoteBranchName(null, 'local')).toBe('local')
})

test('reads the host of ssh, scp-style and https remotes', () => {
  expect(remoteHost('git@gitlab.example.com:team/repo.git')).toBe('gitlab.example.com')
  expect(remoteHost('gitlab.example.com:team/repo.git')).toBe('gitlab.example.com')
  expect(remoteHost('ssh://git@Git.Example.com:2222/team/repo.git')).toBe('git.example.com')
  expect(remoteHost('https://user@github.com/me/repo.git')).toBe('github.com')
  expect(remoteHost('/srv/git/repo.git')).toBeNull()
})
