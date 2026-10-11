export interface PlanItem {
  ref: string
  text: string
  line: number
  depth: number
  isDone: boolean
}

export interface PlanGroup {
  ref: string
  title: string | null
  items: PlanItem[]
}

export interface Outline {
  title: string | null
  groups: PlanGroup[]
}

export type ReportStatus = 'doing' | 'done' | 'blocked'

export interface Report {
  ref: string
  text: string
  status: ReportStatus
  note: string | null
  at: number
}

export interface Progress {
  plan: string
  current: Report | null
  recent: Report[]
}

export interface PlanView {
  progress: Progress | null
  outline: Outline | null
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'plan-progress': { view: PlanView; isClosedByPerson: boolean; now: number }
  }
}
