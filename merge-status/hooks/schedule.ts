import type { MergeRequest } from '../types'
import type { Fingerprint } from './git'
import { pollIntervalMs } from './pipelines'

export const watchIntervalMs = 15_000
export const pushGracePeriodMs = 5 * 60_000

const recheckIntervalMs = 2 * 60_000

export interface Tracking {
  fingerprint: Fingerprint | null
  pushGraceUntil: number
  listedAt: number
  pipelinesPolledAt: number
  generation: number
  isRefreshing: boolean
  isRefreshQueued: boolean
}

export type WatchAction = 'refresh' | 'recheck' | 'poll' | 'idle'

export function initialTracking(): Tracking {
  return {
    fingerprint: null,
    pushGraceUntil: 0,
    listedAt: 0,
    pipelinesPolledAt: 0,
    generation: 0,
    isRefreshing: false,
    isRefreshQueued: false,
  }
}

export function nextWatchAction(
  tracking: Tracking,
  fingerprint: Fingerprint,
  mergeRequests: readonly MergeRequest[],
  now: number,
): WatchAction {
  if (fingerprint.key !== tracking.fingerprint?.key) return 'refresh'
  if (mergeRequests.length > 0 && now - tracking.listedAt >= recheckIntervalMs) return 'recheck'

  const interval = pollIntervalMs(mergeRequests)
  return interval !== null && now - tracking.pipelinesPolledAt >= interval ? 'poll' : 'idle'
}

export function hasMovedUpstream(previous: Fingerprint | null, next: Fingerprint): boolean {
  const previousSha = previous?.upstreamSha ?? null
  return previousSha !== null && next.upstreamSha !== previousSha
}

export function sameNumbers(a: readonly MergeRequest[], b: readonly MergeRequest[]): boolean {
  return a.map(mr => mr.number).join(',') === b.map(mr => mr.number).join(',')
}
