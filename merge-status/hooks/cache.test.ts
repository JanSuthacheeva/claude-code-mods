import { expect, test } from 'claude-code/testing'

import { cacheDir, cacheEntry, cachePath, freshStdout } from './cache'

test('keeps the shared answers in the user cache folder', () => {
  const none = { xdgCacheHome: null, home: null, localAppData: null }

  expect(cacheDir({ ...none, xdgCacheHome: '/xdg', home: '/home/u' })).toBe('/xdg/claude-code-mods/merge-status')
  expect(cacheDir({ ...none, home: '/home/u' })).toBe('/home/u/.cache/claude-code-mods/merge-status')
  expect(cacheDir({ ...none, xdgCacheHome: '', localAppData: 'C:/Users/u/AppData/Local' })).toBe(
    'C:/Users/u/AppData/Local/claude-code-mods/merge-status',
  )
  expect(cacheDir(none)).toBeNull()
})

test('names one file per remote and command, the same in every session', () => {
  const list = ['glab', 'mr', 'list', '--source-branch', 'feature/x']
  const path = cachePath('/c', 'git@gitlab.example.com:team/repo.git', list)

  expect(path).toMatch(/^\/c\/[0-9a-f]{16}\.json$/)
  expect(cachePath('/c', 'git@gitlab.example.com:team/repo.git', list)).toBe(path)
  expect(cachePath('/c', 'git@gitlab.example.com:team/other.git', list)).not.toBe(path)
  expect(cachePath('/c', 'git@gitlab.example.com:team/repo.git', [...list.slice(0, 4), 'develop'])).not.toBe(path)
})

test('reuses an answer only while it is younger than the age asked for', () => {
  const entry = cacheEntry(1_000, '[]')

  expect(freshStdout(entry, 1_000 + 24_999, 25_000)).toBe('[]')
  expect(freshStdout(entry, 1_000 + 25_000, 25_000)).toBeNull()
  expect(freshStdout(entry, 999, 25_000)).toBeNull()
  expect(freshStdout('{"at":1', 1_000, 25_000)).toBeNull()
  expect(freshStdout('{"at":"x","stdout":"[]"}', 1_000, 25_000)).toBeNull()
})
