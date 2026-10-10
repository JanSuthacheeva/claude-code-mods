import type { Source } from '../types'

export interface Attribution {
  pendingSkillCalls: number
  isSkillCallCounted: boolean
  typedCommand: string | null
}

export function initialAttribution(): Attribution {
  return { pendingSkillCalls: 0, isSkillCallCounted: false, typedCommand: null }
}

export function typedCommandOf(text: string): string | null {
  return /^\/(\S+)/.exec(text.trim())?.[1] ?? null
}

function baseName(skill: string): string {
  return skill.replace(/^\//, '').split(':').pop() ?? skill
}

export function isSameSkill(a: string, b: string): boolean {
  return baseName(a) === baseName(b)
}

export function sourceOf(attribution: Attribution, skill: string): Source {
  if (attribution.pendingSkillCalls > 0) return 'claude'
  if (attribution.typedCommand !== null && isSameSkill(attribution.typedCommand, skill)) return 'user'
  return 'preload'
}
