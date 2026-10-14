import type { Board, FlowState, FlowView, Navigation, Phase, Problem } from '../types'

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

export interface Pill {
  text: string
  tone: Tone
}

export interface TabModel {
  key: string
  hotkey: string
  label: string
  mark: string | null
  markTone: Tone
  isActive: boolean
}

export interface CardModel {
  key: string
  flowId: string
  name: string
  state: Pill
  borderTone: Tone
  rail: Step[]
  railLabel: string
  tasks: { done: number; total: number } | null
  age: string
  line: { text: string; tone: Tone }
}

export interface DetailModel {
  name: string
  state: Pill
  mode: Pill
  started: string
  request: string
  borderTone: Tone
  steps: Step[]
  tasks: { done: number; total: number } | null
  blocker: { badge: '!' | '?'; text: string; tone: Tone } | null
  timeline: { glyph: '◉' | '○'; ago: string; text: string; tone: Tone }[]
  older: number
  decisions: string[]
  mergeRequest: string | null
}

export interface BandModel {
  tabs: TabModel[]
  moreFlows: number
  needsYou: Pill | null
  cards: CardModel[][] | null
  detail: DetailModel | null
}

/** Everything the band draws for the board, where the person is in it, at this width. */
export function bandModel(board: Board, navigation: Navigation, columns: number): BandModel {
  const open = board.flows.find(flow => flow.id === navigation.tab) ?? null
  const shown = board.flows.slice(0, maxTabs)
  const tabs: TabModel[] = [
    { key: 'tab-all', hotkey: '0', label: 'All', mark: null, markTone: 'text', isActive: open === null },
    ...shown.map((flow, index) => ({
      key: `tab-${flow.id}`,
      hotkey: String(index + 1),
      label: flow.name,
      mark: flowMark(flow),
      markTone: stateTone(flow),
      isActive: open?.id === flow.id,
    })),
  ]
  const needsYou =
    board.needsYou === 0
      ? null
      : { text: columns >= wideColumns ? `${String(board.needsYou)} need you` : String(board.needsYou), tone: 'warning' as const }
  return {
    tabs,
    moreFlows: Math.max(0, board.flows.length - shown.length),
    needsYou,
    cards: open === null ? rowsOf(board.flows.map(flow => cardOf(flow, board.now)), cardColumns(columns)) : null,
    detail: open === null ? null : detailOf(open, board.now, navigation.offset),
  }
}

/** 3 cards per row from 120 columns, 2 from 78, else 1. */
export function cardColumns(columns: number): number {
  if (columns >= 120) return 3
  return columns >= 78 ? 2 : 1
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

const wideColumns = 110

const entryTones: Record<FlowView['timeline'][number]['tone'], Tone> = {
  problem: 'error',
  attention: 'warning',
  success: 'success',
  progress: 'text',
  neutral: 'subtle',
}

function needsYou(flow: FlowView): boolean {
  return flow.state === 'waiting' || flow.state === 'blocked' || flow.state === 'not-responding'
}

function statePill(flow: FlowView): Pill {
  return { text: stateLabel(flow), tone: stateTone(flow) }
}

function cardOf(flow: FlowView, now: number): CardModel {
  const rail = phaseSteps(flow)
  const current = rail.find(step => step.isCurrent)
  const line =
    needsYou(flow) && flow.blocker !== null
      ? { text: flow.blocker, tone: stateTone(flow) }
      : flow.state === 'delegated' && flow.delegate !== null
        ? { text: `agent: ${flow.delegate}`, tone: 'subtle' as const }
        : { text: flow.request, tone: 'subtle' as const }
  return {
    key: `row-${flow.id}`,
    flowId: flow.id,
    name: flow.name,
    state: statePill(flow),
    borderTone: needsYou(flow) ? stateTone(flow) : 'inactive',
    rail,
    railLabel: flow.state === 'done' ? 'done' : (current?.label ?? 'starting'),
    tasks: flow.tasks,
    age: shortDuration(now - flow.changedAt),
    line,
  }
}

function detailOf(flow: FlowView, now: number, offset: number): DetailModel {
  const newestFirst = [...flow.timeline].reverse()
  const window = newestFirst.slice(offset, offset + timelineRows)
  return {
    name: flow.name,
    state: statePill(flow),
    mode: { text: flow.mode, tone: 'subtle' },
    started: `started ${shortDuration(now - flow.startedAt)} ago`,
    request: flow.request,
    borderTone: needsYou(flow) ? stateTone(flow) : 'inactive',
    steps: phaseSteps(flow),
    tasks: flow.tasks,
    blocker:
      needsYou(flow) && flow.blocker !== null
        ? { badge: flow.state === 'waiting' ? '?' : '!', text: flow.blocker, tone: stateTone(flow) }
        : null,
    timeline: window.map((entry, index) => ({
      glyph: offset === 0 && index === 0 ? '◉' : '○',
      ago: shortDuration(now - entry.at),
      text: entry.text,
      tone: entryTones[entry.tone],
    })),
    older: Math.max(0, newestFirst.length - offset - timelineRows),
    decisions: flow.decisions.slice(-timelineRows),
    mergeRequest: flow.mergeRequest,
  }
}

function rowsOf<T>(items: T[], perRow: number): T[][] {
  const rows: T[][] = []
  for (let index = 0; index < items.length; index += perRow) rows.push(items.slice(index, index + perRow))
  return rows
}
