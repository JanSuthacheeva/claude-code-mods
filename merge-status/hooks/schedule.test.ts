import { expect, test } from 'claude-code/testing'

import { mergeRequest } from './fixtures'
import { toFingerprint } from './git'
import { hasMovedUpstream, initialTracking, nextWatchAction } from './schedule'
import type { Tracking } from './schedule'

const fingerprint = toFingerprint('/repo\nfeature/x', 'f1')
const tracking: Tracking = { ...initialTracking(), fingerprint }
const running = mergeRequest({ number: 1, pipeline: { status: 'running', id: '1', url: '' } })
const passed = mergeRequest({ number: 1, pipeline: { status: 'passed', id: '1', url: '' } })

test('refreshes whenever the branch or its upstream commit changes', () => {
  expect(nextWatchAction(initialTracking(), fingerprint, [], 0)).toBe('refresh')
  expect(nextWatchAction(tracking, toFingerprint('/repo\ndevelop', 'd1'), [], 0)).toBe('refresh')
  expect(nextWatchAction(tracking, toFingerprint('/repo\nfeature/x', 'f2'), [], 0)).toBe('refresh')
})

test('rechecks the open MRs every 2 minutes, before polling pipelines', () => {
  expect(nextWatchAction(tracking, fingerprint, [passed], 60_000)).toBe('idle')
  expect(nextWatchAction(tracking, fingerprint, [passed], 120_000)).toBe('recheck')
  expect(nextWatchAction(tracking, fingerprint, [], 120_000)).toBe('idle')
})

test('polls a running pipeline every 30 seconds', () => {
  expect(nextWatchAction(tracking, fingerprint, [running], 29_999)).toBe('idle')
  expect(nextWatchAction(tracking, fingerprint, [running], 30_000)).toBe('poll')
})

test('treats a new upstream commit on the same branch as a push', () => {
  expect(hasMovedUpstream(null, fingerprint)).toBe(false)
  expect(hasMovedUpstream(fingerprint, fingerprint)).toBe(false)
  expect(hasMovedUpstream(fingerprint, toFingerprint('/repo\nfeature/x', 'f2'))).toBe(true)
})
