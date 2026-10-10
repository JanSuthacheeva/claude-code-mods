import type { Usage } from '../types'
import { rankedSkills } from './usage'

export interface StackedBar {
  you: string
  claude: string
  track: string
}

export interface BandRow {
  rank: number
  name: string
  user: number
  claude: number
  total: number
  bar: StackedBar
  rate: string
  lastUsed: string
}

export interface BandLayout {
  width: number
  nameWidth: number
  barWidth: number
  rows: BandRow[]
  hiddenCount: number
}

export const columnWidths = { rank: 3, you: 5, claude: 6, total: 6, rate: 6, last: 9 } as const

const minuteMs = 60_000
const hourMs = 60 * minuteMs
const dayMs = 24 * hourMs
const eighths = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

const frameColumns = 4
const frameRows = 7
const columnGaps = 7
const nameWidthRange = { min: 5, max: 26 }
const barWidthRange = { min: 6, max: 40 }

function clamp(value: number, range: { min: number; max: number }): number {
  return Math.max(range.min, Math.min(range.max, value))
}

export function thousands(value: number): string {
  return value.toLocaleString('en-US')
}

export function relativeTime(iso: string, now: number): string {
  const elapsed = now - Date.parse(iso)
  if (Number.isNaN(elapsed)) return '-'
  if (elapsed < minuteMs) return 'just now'
  if (elapsed < hourMs) return `${String(Math.floor(elapsed / minuteMs))}m ago`
  if (elapsed < dayMs) return `${String(Math.floor(elapsed / hourMs))}h ago`
  if (elapsed < 30 * dayMs) return `${String(Math.floor(elapsed / dayMs))}d ago`
  return iso.slice(0, 10)
}

export function perHundred(count: number, prompts: number): string {
  return prompts > 0 ? ((count / prompts) * 100).toFixed(1) : '-'
}

export function stackedBar(user: number, claude: number, max: number, width: number): StackedBar {
  const scale = max > 0 ? width / max : 0
  const youCells = Math.round(user * scale)
  const claudeCells = Math.max(0, (user + claude) * scale - youCells)
  const fullCells = Math.floor(claudeCells)
  const minTail = fullCells === 0 ? 1 : 0
  const tail = claude > 0 ? (eighths[Math.max(minTail, Math.round((claudeCells - fullCells) * 8))] ?? '') : ''
  const claudeBar = '█'.repeat(fullCells) + tail

  return {
    you: '█'.repeat(youCells),
    claude: claudeBar,
    track: '─'.repeat(Math.max(0, width - youCells - claudeBar.length)),
  }
}

export function bandLayout(usage: Usage, bodyColumns: number, maxRows: number, now: number): BandLayout {
  const ranked = rankedSkills(usage)
  const shown = ranked.slice(0, Math.max(1, maxRows - frameRows))

  const nameWidth = clamp(Math.max(0, ...shown.map(skill => skill.name.length)), nameWidthRange)
  const fixedWidth = Object.values(columnWidths).reduce((sum, width) => sum + width, 0) + nameWidth + columnGaps
  const barWidth = clamp(bodyColumns - frameColumns - fixedWidth, barWidthRange)
  const width = Math.min(bodyColumns, frameColumns + fixedWidth + barWidth)
  const max = Math.max(1, ...shown.map(skill => skill.total))

  const rows = shown.map((skill, index) => ({
    rank: index + 1,
    name: skill.name,
    user: skill.user,
    claude: skill.claude,
    total: skill.total,
    bar: stackedBar(skill.user, skill.claude, max, barWidth),
    rate: perHundred(skill.total, usage.prompts),
    lastUsed: relativeTime(skill.lastUsed, now),
  }))

  return { width, nameWidth, barWidth, rows, hiddenCount: ranked.length - shown.length }
}
