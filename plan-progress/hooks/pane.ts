import type { Outline, PlanGroup, PlanItem, Progress, Report, ReportStatus } from '../types'
import { allItems, counts } from './outline'
import { fileName, nextItem, recentRows } from './progress'

export type ItemState = 'done' | 'active' | 'blocked' | 'open'

export interface ItemRow {
  ref: string
  text: string
  depth: number
  state: ItemState
}

export interface GroupRow {
  ref: string
  title: string | null
  done: number
  total: number
  state: ItemState
  items: ItemRow[] | null
}

export interface Focus {
  label: 'Now' | 'Blocked' | 'Next'
  ref: string
  text: string
  note: string | null
  age: string | null
}

export interface RecentRow {
  key: string
  age: string
  status: ReportStatus
  ref: string
  text: string
}

export interface PaneModel {
  title: string
  done: number
  total: number
  isComplete: boolean
  bar: { filled: number; empty: number }
  focus: Focus | null
  next: PlanItem | null
  groups: GroupRow[]
  recent: RecentRow[]
}

const dockShare = 1 / 3
const dockBorderColumns = 1

export function dockColumns(terminalColumns: number): number {
  return Math.max(1, Math.round(terminalColumns * dockShare) - dockBorderColumns)
}

export function terminalColumnsBesideDock(transcriptColumns: number, bodyColumns: number): number {
  return transcriptColumns + dockBorderColumns + bodyColumns
}

const minuteMs = 60_000
const hourMs = 60 * minuteMs
const dayMs = 24 * hourMs

export function relativeAge(at: number, now: number): string {
  const elapsed = Math.max(0, now - at)
  if (elapsed < minuteMs) return 'now'
  if (elapsed < hourMs) return `${String(Math.floor(elapsed / minuteMs))}m`
  if (elapsed < dayMs) return `${String(Math.floor(elapsed / hourMs))}h`
  return `${String(Math.floor(elapsed / dayMs))}d`
}

function isInGroup(group: PlanGroup, ref: string): boolean {
  return group.ref === ref || group.items.some(item => item.ref === ref)
}

function liveCurrent(outline: Outline, current: Report | null): Report | null {
  if (current === null) return null
  const item = allItems(outline).find(one => one.ref === current.ref)
  if (item !== undefined) return item.isDone ? null : current
  const group = outline.groups.find(one => one.ref === current.ref)
  return group !== undefined && group.items.some(one => !one.isDone) ? current : null
}

function isSameReport(report: Report, other: Report | null): boolean {
  return other !== null && report.ref === other.ref && report.at === other.at
}

function itemState(item: PlanItem, current: Report | null, blockedRefs: Set<string>): ItemState {
  if (item.isDone) return 'done'
  if (current?.ref === item.ref) return current.status === 'blocked' ? 'blocked' : 'active'
  return blockedRefs.has(item.ref) ? 'blocked' : 'open'
}

function groupState(group: PlanGroup, isActive: boolean, current: Report | null, blockedRefs: Set<string>): ItemState {
  if (group.items.every(item => item.isDone)) return 'done'
  const isCurrentHere = current !== null && isInGroup(group, current.ref)
  if (isActive && isCurrentHere) return current.status === 'blocked' ? 'blocked' : 'active'
  const hasBlocked = blockedRefs.has(group.ref) || group.items.some(item => !item.isDone && blockedRefs.has(item.ref))
  if (hasBlocked) return 'blocked'
  return isActive ? 'active' : 'open'
}

export function paneModel(
  plan: string,
  outline: Outline,
  progress: Progress,
  now: number,
  bodyColumns: number,
): PaneModel {
  const { done, total } = counts(outline)
  const current = liveCurrent(outline, progress.current)
  const items = allItems(outline)
  const firstOpen = items.find(item => !item.isDone) ?? null

  const activeGroup =
    (current === null ? undefined : outline.groups.find(group => isInGroup(group, current.ref))) ??
    outline.groups.find(group => group.items.some(item => !item.isDone))
  const isFlat = outline.groups.length === 1
  const blockedRefs = new Set(progress.recent.filter(report => report.status === 'blocked').map(report => report.ref))

  const groups = outline.groups.map(group => {
    const isActive = group === activeGroup
    return {
      ref: group.ref,
      title: group.title,
      done: group.items.filter(item => item.isDone).length,
      total: group.items.length,
      state: groupState(group, isActive, current, blockedRefs),
      items:
        isActive || isFlat
          ? group.items.map(item => ({ ...item, state: itemState(item, current, blockedRefs) }))
          : null,
    }
  })

  const next = current === null ? null : nextItem(outline, current)
  const focus: Focus | null =
    current !== null
      ? {
          label: current.status === 'blocked' ? 'Blocked' : 'Now',
          ref: current.ref,
          text: current.text,
          note: current.note,
          age: relativeAge(current.at, now),
        }
      : firstOpen !== null
        ? { label: 'Next', ref: firstOpen.ref, text: firstOpen.text, note: null, age: null }
        : null

  const width = Math.max(1, bodyColumns)
  const filled = total === 0 ? 0 : Math.round((done / total) * width)

  return {
    title: outline.title ?? fileName(plan).replace(/\.md$/i, ''),
    done,
    total,
    isComplete: total > 0 && done === total,
    bar: { filled, empty: width - filled },
    focus,
    next,
    groups,
    recent: progress.recent
      .filter(report => !isSameReport(report, current))
      .slice(0, recentRows)
      .map(report => ({
        key: `${report.ref}-${String(report.at)}`,
        age: relativeAge(report.at, now),
        status: report.status,
        ref: report.ref,
        text: report.text,
      })),
  }
}
