import type { MergeRequest } from '../types'

export function mergeRequest(overrides: Partial<MergeRequest> & Pick<MergeRequest, 'iid'>): MergeRequest {
  return {
    projectId: 1,
    state: 'opened',
    isDraft: false,
    targetBranch: 'develop',
    url: `https://git.example/mr/${String(overrides.iid)}`,
    pipeline: null,
    hasConflicts: false,
    ...overrides,
  }
}
