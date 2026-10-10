import { expect, test } from 'claude-code/testing'

import { describeProcessError, detectForge, passedLine, passedNote } from './forge'
import { github } from './github'
import { gitlab } from './gitlab'
import type { FinishedMergeRequest } from './pipelines'
import { mergeRequest } from './fixtures'

test('picks GitHub for github.com and github.* hosts, GitLab for any other host', () => {
  expect(detectForge('git@github.com:me/repo.git')).toBe(github)
  expect(detectForge('https://github.com/me/repo.git')).toBe(github)
  expect(detectForge('ssh://git@GitHub.com/me/repo.git')).toBe(github)
  expect(detectForge('git@github.acme.com:team/repo.git')).toBe(github)
  expect(detectForge('git@gitlab.example.com:team/repo.git')).toBe(gitlab)
  expect(detectForge('https://git.example.com/team/repo.git')).toBe(gitlab)
  expect(detectForge('https://mygithub.example.com/team/repo.git')).toBe(gitlab)
})

test('ignores repositories without a remote on a host', () => {
  expect(detectForge(null)).toBeNull()
  expect(detectForge('/srv/git/repo.git')).toBeNull()
  expect(detectForge('file:///srv/git/repo.git')).toBeNull()
  expect(detectForge('C:\\repos\\repo.git')).toBeNull()
})

test('names the missing CLI of the forge in use', () => {
  const notFound = (cli: string): Error => new Error(`failed to start: ENOENT: Executable not found in $PATH: "${cli}"`)

  expect(describeProcessError(gitlab, notFound('glab'))).toBe(gitlab.notInstalledMessage)
  expect(describeProcessError(github, notFound('gh'))).toBe(github.notInstalledMessage)
  expect(describeProcessError(github, new Error('process still running after 20000ms'))).toBe(
    'gh did not answer in time',
  )
})

test('tells Claude about a passed pipeline without asking for anything', () => {
  const passed: FinishedMergeRequest = {
    ...mergeRequest({ number: 12 }),
    pipeline: { status: 'passed', id: '42', url: 'https://git.example/p/42' },
  }

  expect(passedNote(gitlab, passed, 'feature/x')).toBe(
    'Automatic note from the merge-status plugin, not written by the user: the pipeline of MR !12 (feature/x → develop) passed: https://git.example/p/42\n' +
      'For your information only: no action needed.',
  )
  expect(passedNote(github, passed, 'feature/x')).toContain('the checks of PR #12 (feature/x → develop) passed')
  expect(passedLine(gitlab, passed)).toBe('MR !12 → develop: pipeline passed')
  expect(passedLine(github, passed)).toBe('PR #12 → develop: checks passed')
})
