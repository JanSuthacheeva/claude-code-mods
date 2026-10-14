import type { Board, FlowView, Navigation } from '../types'
import { maxTabs, timelineRows } from './board'

/** All tab, cursor on the first card, newest timeline entries. */
export const start: Navigation = { tab: null, cursor: 0, offset: 0 }

/** 0 is All, 1-9 the flow in that tab; a digit without a flow changes nothing. */
export function jumpTo(board: Board, navigation: Navigation, digit: number): Navigation {
  if (digit === 0) return { ...navigation, tab: null, offset: 0 }
  const flow = digit <= maxTabs ? board.flows[digit - 1] : undefined
  return flow ? { ...navigation, tab: flow.id, offset: 0 } : navigation
}

/** h / l: the previous or next tab, wrapping. */
export function stepTab(board: Board, navigation: Navigation, by: -1 | 1): Navigation {
  const tabs = [null, ...board.flows.slice(0, maxTabs).map(flow => flow.id)]
  const at = Math.max(0, tabs.indexOf(navigation.tab))
  const next = tabs[(at + by + tabs.length) % tabs.length] ?? null
  return { ...navigation, tab: next, offset: 0 }
}

/** j / k on All: the cursor one card down or up, clamped. */
export function moveCursor(board: Board, navigation: Navigation, by: -1 | 1): Navigation {
  if (navigation.tab !== null) return navigation
  return { ...navigation, cursor: clamp(navigation.cursor + by, board.flows.length - 1) }
}

/** j / k on a flow's tab: the timeline window one entry older or newer, clamped. */
export function scrollTimeline(board: Board, navigation: Navigation, by: -1 | 1): Navigation {
  const flow = board.flows.find(candidate => candidate.id === navigation.tab)
  if (!flow) return navigation
  return { ...navigation, offset: clamp(navigation.offset + by, lastOffset(flow)) }
}

/** g: the first card on All, the newest entries on a flow's tab. */
export function toTop(navigation: Navigation): Navigation {
  return navigation.tab === null ? { ...navigation, cursor: 0 } : { ...navigation, offset: 0 }
}

/** After a refresh: a cleared flow's tab falls back to All, cursor and window clamped. */
export function reconcile(board: Board, navigation: Navigation): Navigation {
  const flow = board.flows.find(candidate => candidate.id === navigation.tab)
  return {
    tab: flow ? flow.id : null,
    cursor: clamp(navigation.cursor, board.flows.length - 1),
    offset: flow ? clamp(navigation.offset, lastOffset(flow)) : 0,
  }
}

/** The flow on the open tab, or under the cursor on All. */
export function currentFlow(board: Board, navigation: Navigation): FlowView | null {
  if (navigation.tab !== null) return board.flows.find(flow => flow.id === navigation.tab) ?? null
  return board.flows[navigation.cursor] ?? null
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(0, max), Math.max(0, value))
}

function lastOffset(flow: FlowView): number {
  return Math.max(0, flow.timeline.length - timelineRows)
}
