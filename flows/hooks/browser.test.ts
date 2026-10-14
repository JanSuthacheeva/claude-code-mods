import { expect, test } from 'claude-code/testing'

import { detectPlatform, openUrlArgv } from './browser'

test('detects the platform from the OS variable and the kernel name', () => {
  expect(detectPlatform('Windows_NT', null)).toBe('windows')
  expect(detectPlatform(undefined, 'Darwin')).toBe('macos')
  expect(detectPlatform(undefined, 'Linux')).toBe('linux')
})

test('opens URLs with each platform’s own handler', () => {
  const url = 'https://git.example/mr/8?tab=pipelines&page=2'

  expect(openUrlArgv('macos', url)).toEqual(['open', url])
  expect(openUrlArgv('linux', url)).toEqual(['xdg-open', url])
  expect(openUrlArgv('windows', url)).toEqual(['rundll32', 'url.dll,FileProtocolHandler', url])
})
