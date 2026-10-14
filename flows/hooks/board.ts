import type { Board, FlowState, FlowView, Phase, Problem } from '../types'

/** The flow status --json version this mod reads. */
export const boardVersion = 1
/** Flows that get a digit and a tab; the rest show as +n and are reached with l. */
export const maxTabs = 9
/** Timeline entries and decisions a flow's tab shows at once. */
export const timelineRows = 3

export type Tone = 'claude' | 'success' | 'warning' | 'error' | 'subtle' | 'inactive' | 'text'

const notABoard: Problem = { kind: 'failed', message: 'flow printed something that is not a board' }

const phaseLabels: Record<Phase, string> = {
  design: 'design',
  implement: 'implement',
  review: 'review',
  'merge-request': 'MR',
}

const phaseVerbs: Record<Phase, string> = {
  design: 'designing',
  implement: 'implementing',
  review: 'reviewing',
  'merge-request': 'writing MR',
}

const stateTones: Record<FlowState, Tone> = {
  working: 'claude',
  delegated: 'claude',
  waiting: 'warning',
  blocked: 'error',
  'not-responding': 'error',
  done: 'success',
  ended: 'subtle',
}

const stateMarks: Record<FlowState, string | null> = {
  working: null,
  delegated: null,
  waiting: '●',
  blocked: '●',
  'not-responding': '●',
  done: '✓',
  ended: '–',
}

export interface Step {
  phase: Phase
  label: string
  duration: string
  tone: Tone
  glyph: '●' | '◉' | '○'
  isCurrent: boolean
}

/** The board, or why there is none: unparsable output or another contract version. */
export function parseBoard(stdout: string): Board | Problem {
  let value: unknown
  try {
    value = JSON.parse(stdout)
  } catch {
    return notABoard
  }
  if (typeof value !== 'object' || value === null || !('version' in value)) return notABoard
  const version = (value as { version: unknown }).version
  if (typeof version !== 'number') return notABoard
  if (version !== boardVersion) return { kind: 'unsupported', version }
  return Array.isArray((value as { flows?: unknown }).flows) ? (value as Board) : notABoard
}

/** designing, implementing · agent, waiting for you, blocked, not responding, MR open, ended. */
export function stateLabel(flow: FlowView): string {
  const verb = flow.phase === null ? null : phaseVerbs[flow.phase]
  switch (flow.state) {
    case 'working':
      return verb ?? 'starting'
    case 'delegated':
      return `${verb ?? 'working'} · agent`
    case 'waiting':
      return 'waiting for you'
    case 'not-responding':
      return 'not responding'
    case 'done':
      return 'MR open'
    default:
      return flow.state
  }
}

/** claude while running, warning waiting, error blocked or silent, success done, subtle ended. */
export function stateTone(flow: FlowView): Tone {
  return stateTones[flow.state]
}

/** ● for flows that need you, ✓ done, – ended, null while running. */
export function flowMark(flow: FlowView): string | null {
  return stateMarks[flow.state]
}

/** One step per phase: done success, current in the state tone, open inactive. */
export function phaseSteps(flow: FlowView): Step[] {
  const isFinished = flow.state === 'done'
  return flow.steps.map(step => {
    const isDone = isFinished || step.status === 'done'
    const isCurrent = !isFinished && step.status === 'current'
    return {
      phase: step.phase,
      label: phaseLabels[step.phase],
      duration: step.durationMs === null ? '' : shortDuration(step.durationMs),
      tone: isDone ? 'success' : isCurrent ? stateTone(flow) : 'inactive',
      glyph: isDone ? '●' : isCurrent ? '◉' : '○',
      isCurrent,
    }
  })
}

/** 45s, 12m, 3h, 2d. */
export function shortDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000))
  if (seconds < 60) return `${String(seconds)}s`
  if (seconds < 3_600) return `${String(Math.floor(seconds / 60))}m`
  if (seconds < 86_400) return `${String(Math.floor(seconds / 3_600))}h`
  return `${String(Math.floor(seconds / 86_400))}d`
}
