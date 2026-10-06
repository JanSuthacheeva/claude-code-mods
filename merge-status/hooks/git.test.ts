import { expect, test } from 'claude-code/testing'

import { isGitlabRemote, isTriggeringCommand, remoteBranchName } from './git'

test('triggers on checkout, switch, push, pull and MR creation only', () => {
  const triggering = [
    'git checkout develop',
    'git switch -c x',
    'git push -u origin x',
    'git -C /repo pull',
    'cd a && git push',
    'glab mr create --fill',
  ]
  const ignored = ['git status', 'git log --oneline', 'glab mr list', 'git commit -m "push docs"', 'echo checkout']

  for (const command of triggering) expect(isTriggeringCommand(command)).toBe(true)
  for (const command of ignored) expect(isTriggeringCommand(command)).toBe(false)
})

test('names the remote branch after the upstream, falling back to the local one', () => {
  expect(remoteBranchName('origin/feature/x', 'local')).toBe('feature/x')
  expect(remoteBranchName(null, 'local')).toBe('local')
})

test('treats any non-GitHub remote as GitLab', () => {
  expect(isGitlabRemote('git@gitlab.example.com:team/repo.git')).toBe(true)
  expect(isGitlabRemote('git@github.com:me/repo.git')).toBe(false)
  expect(isGitlabRemote(null)).toBe(false)
})
