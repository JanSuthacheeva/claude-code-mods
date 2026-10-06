export type MergeRequestState = 'opened' | 'merged' | 'closed' | 'locked'

export type PipelineStatus =
  | 'created'
  | 'waiting_for_resource'
  | 'preparing'
  | 'pending'
  | 'running'
  | 'scheduled'
  | 'manual'
  | 'success'
  | 'failed'
  | 'canceled'
  | 'skipped'

export interface ResolvedPipeline {
  status: PipelineStatus
  id: number
  url: string
}

export type Pipeline = ResolvedPipeline | { status: 'awaiting' }

export interface MergeRequest {
  iid: number
  projectId: number
  state: MergeRequestState
  isDraft: boolean
  targetBranch: string
  url: string
  pipeline: Pipeline | null
  hasConflicts: boolean
}

export interface BranchStatus {
  repo: string | null
  branch: string | null
  mergeRequests: MergeRequest[] | null
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'merge-status': { branchStatus: BranchStatus; isVisible: boolean }
  }
}
