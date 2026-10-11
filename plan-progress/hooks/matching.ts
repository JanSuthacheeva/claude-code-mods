import type { Outline, PlanGroup, PlanItem } from '../types'
import { allItems } from './outline'

export type Target = { kind: 'item'; item: PlanItem } | { kind: 'group'; group: PlanGroup }

export type Resolution = { target: Target } | { error: string }

const refPattern = /^(?:t|#)?\s*(\d+(?:\.\d+)?)$/i
const maxCandidates = 5

function lower(text: string): string {
  return text.toLowerCase()
}

function byRef(outline: Outline, ref: string): Target | null {
  const item = allItems(outline).find(one => one.ref === ref)
  if (item !== undefined) return { kind: 'item', item }
  const group = outline.groups.find(one => one.ref === ref)
  return group === undefined ? null : { kind: 'group', group }
}

function describe(target: Target): string {
  return target.kind === 'item'
    ? `${target.item.ref} ${target.item.text}`
    : `${target.group.ref} ${target.group.title ?? ''}`.trim()
}

function pick(candidates: Target[], query: string): Resolution | null {
  if (candidates.length === 0) return null
  const [only] = candidates
  if (candidates.length === 1 && only !== undefined) return { target: only }

  const listed = candidates.slice(0, maxCandidates).map(describe).join('; ')
  const more = candidates.length > maxCandidates ? ` and ${String(candidates.length - maxCandidates)} more` : ''
  return { error: `"${query}" matches several items: ${listed}${more}. Pass the ref.` }
}

function itemTargets(items: PlanItem[]): Target[] {
  return items.map(item => ({ kind: 'item', item }))
}

function groupTargets(groups: PlanGroup[]): Target[] {
  return groups.map(group => ({ kind: 'group', group }))
}

function byGroupAndItem(outline: Outline, query: string): Resolution | null {
  const [groupPart, itemPart] = query.split(' / ').map(part => lower(part.trim()))
  if (groupPart === undefined || itemPart === undefined || itemPart === '') return null

  const items = outline.groups
    .filter(group => group.ref === groupPart.replace(refPattern, '$1') || lower(group.title ?? '').includes(groupPart))
    .flatMap(group => group.items)
    .filter(item => lower(item.text).includes(itemPart))
  return pick(itemTargets(items), query)
}

function byText(outline: Outline, query: string): Resolution | null {
  const wanted = lower(query)
  const items = allItems(outline)
  const titled = outline.groups.filter(group => group.title !== null)
  const tiers: ((text: string) => boolean)[] = [
    text => text === wanted,
    text => text.startsWith(wanted),
    text => text.includes(wanted),
  ]

  for (const matches of tiers) {
    const found = pick(
      [
        ...itemTargets(items.filter(item => matches(lower(item.text)))),
        ...groupTargets(titled.filter(group => matches(lower(group.title ?? '')))),
      ],
      query,
    )
    if (found !== null) return found
  }
  return null
}

export function resolveItem(outline: Outline, query: string): Resolution {
  const trimmed = query.trim()
  const ref = refPattern.exec(trimmed)?.[1]
  const target = ref === undefined ? null : byRef(outline, ref)
  if (target !== null) return { target }

  return (
    byGroupAndItem(outline, trimmed) ??
    byText(outline, trimmed) ?? {
      error: `No item matches "${trimmed}". Pass a ref like 1.2 or part of the item's text.`,
    }
  )
}
