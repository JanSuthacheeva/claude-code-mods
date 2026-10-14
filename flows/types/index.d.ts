// flow status --json, contract version 1 (~/projects/flow/src/view.rs)
export type FlowState = 'working' | 'delegated' | 'waiting' | 'blocked' | 'not-responding' | 'done' | 'ended'
export type Phase = 'design' | 'implement' | 'review' | 'merge-request'

export interface FlowStep {
  phase: Phase
  status: 'done' | 'current' | 'open'
  durationMs: number | null
}

export interface FlowEntry {
  at: number
  text: string
  tone: 'neutral' | 'progress' | 'attention' | 'problem' | 'success'
}

export interface FlowView {
  id: string
  name: string
  request: string
  mode: 'guided' | 'auto'
  phase: Phase | null
  state: FlowState
  blocker: string | null
  delegate: string | null
  tasks: { done: number; total: number } | null
  review: { fixed: number; open: number } | null
  mergeRequest: string | null
  decisions: string[]
  steps: FlowStep[]
  timeline: FlowEntry[]
  startedAt: number
  changedAt: number
}

export interface Board {
  version: number
  now: number
  count: number
  needsYou: number
  flows: FlowView[]
}

export type Problem =
  | { kind: 'missing'; path: string }
  | { kind: 'failed'; message: string }
  | { kind: 'unsupported'; version: number }

export interface BandView {
  board: Board | null
  problem: Problem | null
}

export interface Navigation {
  tab: string | null
  cursor: number
  offset: number
}

declare module 'claude-code' {
  interface PluginState {
    flows: { view: BandView; navigation: Navigation; isShown: boolean }
  }
}
