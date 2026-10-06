import { expect, test } from 'claude-code/testing'

import { describeProcessError, detectForge } from './forge'
import { github } from './github'
import { gitlab } from './gitlab'

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
