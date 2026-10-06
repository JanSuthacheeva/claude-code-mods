import type { MergeRequest } from '../types'

export function mergeRequest(overrides: Partial<MergeRequest> & Pick<MergeRequest, 'number'>): MergeRequest {
  return {
    project: '1',
    state: 'open',
    isDraft: false,
    targetBranch: 'develop',
    url: `https://git.example/mr/${String(overrides.number)}`,
    pipeline: null,
    hasConflicts: false,
    ...overrides,
  }
}
