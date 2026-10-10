export type ForgeName = 'gitlab' | 'github'

export type IconStyle = 'nerd-font' | 'text'

export type MergeRequestState = 'open' | 'merged' | 'closed'

export type PipelineStatus = 'running' | 'passed' | 'failed' | 'canceled' | 'idle'

export interface ResolvedPipeline {
  status: PipelineStatus
  id: string
  url: string
}

export type Pipeline = ResolvedPipeline | { status: 'awaiting' }

export interface MergeRequest {
  number: number
  project: string
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
  forge: ForgeName | null
  mergeRequests: MergeRequest[] | null
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'merge-status': { branchStatus: BranchStatus; isVisible: boolean; isSessionStarted: boolean }
  }
}
