import type { Outline, Progress, Report } from '../types'
import type { Target } from './matching'
import { allItems, counts } from './outline'

export const recentLimit = 3

export function emptyProgress(plan: string): Progress {
  return { plan, current: null, recent: [] }
}

export function absolutePath(cwd: string, path: string): string {
  const trimmed = path.trim()
  if (trimmed.startsWith('/') || /^[A-Za-z]:[\\/]/.test(trimmed)) return trimmed
  return `${cwd.replace(/[\\/]$/, '')}/${trimmed.replace(/^\.\//, '')}`
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function targetRef(target: Target): string {
  return target.kind === 'item' ? target.item.ref : target.group.ref
}

export function targetText(target: Target): string {
  return target.kind === 'item' ? target.item.text : (target.group.title ?? `Group ${target.group.ref}`)
}

export function linesToTick(target: Target): number[] {
  const items = target.kind === 'item' ? [target.item] : target.group.items
  return items.filter(item => !item.isDone).map(item => item.line)
}

export function withReport(progress: Progress, report: Report): Progress {
  const isCurrentFinished = report.status === 'done' && progress.current?.ref === report.ref
  const current = report.status === 'done' ? (isCurrentFinished ? null : progress.current) : report
  const recent = [report, ...progress.recent.filter(one => one.ref !== report.ref)].slice(0, recentLimit)
  return { ...progress, current, recent }
}

export function summaryLine(outline: Outline, current: Report | null): string {
  const { done, total } = counts(outline)
  if (total === 0) return 'ok, but the plan has no checkbox items yet'

  const isWorking = current !== null && current.status !== 'done'
  const next = allItems(outline).find(
    item => !item.isDone && !(isWorking && (item.ref === current.ref || item.ref.startsWith(`${current.ref}.`))),
  )
  const label = isWorking ? 'after this' : 'next'
  if (next !== undefined) return `ok, ${String(done)}/${String(total)} done - ${label}: ${next.ref} ${next.text}`
  if (done === total) return `ok, all ${String(total)} done - plan complete`
  return isWorking
    ? `ok, ${String(done)}/${String(total)} done - this is the last open item`
    : `ok, ${String(done)}/${String(total)} done`
}
