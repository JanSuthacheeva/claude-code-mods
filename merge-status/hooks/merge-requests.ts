import type { MergeRequest } from '../types'

function targetPriority(targetBranch: string): number {
  if (/^(?:develop|development|dev)$/.test(targetBranch)) return 1
  if (/^sprint/i.test(targetBranch)) return 2
  if (/^(?:main|master)$/.test(targetBranch)) return 3
  return 0
}

export function openByPriority(mergeRequests: readonly MergeRequest[]): MergeRequest[] {
  return mergeRequests
    .filter(mr => mr.state === 'open')
    .sort((a, b) => targetPriority(a.targetBranch) - targetPriority(b.targetBranch) || b.number - a.number)
}

export function pickMergeRequest(mergeRequests: readonly MergeRequest[], query: string): MergeRequest | undefined {
  const wanted = query.trim().replace(/^[!#]/, '')
  if (wanted === '') return mergeRequests[0]

  const number = Number(wanted)
  if (!Number.isInteger(number) || number < 1) return undefined
  return mergeRequests.find(mr => mr.number === number) ?? mergeRequests[number - 1]
}
