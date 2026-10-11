import type { Outline, PlanGroup, PlanItem } from '../types'

const headingPattern = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const checkboxPattern = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/
const fencePattern = /^\s*(```|~~~)/
const indentWidth = 2

export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .trim()
}

function indentOf(whitespace: string): number {
  return whitespace.replace(/\t/g, '  ').length
}

export function parseOutline(markdown: string): Outline {
  const lines = markdown.split(/\r?\n/)
  const groups: { title: string | null; items: Omit<PlanItem, 'ref'>[] }[] = [{ title: null, items: [] }]
  let title: string | null = null
  let isInFence = false

  lines.forEach((line, index) => {
    if (fencePattern.test(line)) {
      isInFence = !isInFence
      return
    }
    if (isInFence) return

    const heading = headingPattern.exec(line)
    if (heading !== null) {
      const text = plainText(heading[2] ?? '')
      if (heading[1] === '#' && title === null) title = text
      else groups.push({ title: text, items: [] })
      return
    }

    const checkbox = checkboxPattern.exec(line)
    if (checkbox === null) return
    groups[groups.length - 1]?.items.push({
      text: plainText(checkbox[3] ?? ''),
      line: index,
      depth: Math.floor(indentOf(checkbox[1] ?? '') / indentWidth),
      isDone: checkbox[2] !== ' ',
    })
  })

  const filled = groups.filter(group => group.items.length > 0)
  const isFlat = filled.length === 1

  return {
    title,
    groups: filled.map((group, groupIndex): PlanGroup => {
      const groupRef = String(groupIndex + 1)
      return {
        ref: groupRef,
        title: group.title,
        items: group.items.map((item, itemIndex) => ({
          ...item,
          ref: isFlat ? String(itemIndex + 1) : `${groupRef}.${String(itemIndex + 1)}`,
        })),
      }
    }),
  }
}

export function allItems(outline: Outline): PlanItem[] {
  return outline.groups.flatMap(group => group.items)
}

export function counts(outline: Outline): { done: number; total: number } {
  const items = allItems(outline)
  return { done: items.filter(item => item.isDone).length, total: items.length }
}

export function firstOpenItem(outline: Outline): PlanItem | null {
  return allItems(outline).find(item => !item.isDone) ?? null
}

export function withTicked(markdown: string, lines: readonly number[]): string {
  const targets = new Set(lines)
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n'
  return markdown
    .split(/\r?\n/)
    .map((line, index) => (targets.has(index) ? line.replace(/\[ \]/, '[x]') : line))
    .join(newline)
}
