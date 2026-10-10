import type { CommandInfo } from 'claude-code'

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

function isSkillCommand(command: CommandInfo): boolean {
  return command.source === 'user' || (command.source === 'plugin' && command.name.includes(':'))
}

export function typedSkillOf(typed: string, commands: readonly CommandInfo[]): string | null {
  const skills = commands.filter(isSkillCommand)
  const exact = skills.find(command => command.name === typed)
  if (exact !== undefined) return exact.name

  const sameName = skills.filter(command => isSameSkill(command.name, typed))
  return sameName.length === 1 ? (sameName[0]?.name ?? null) : null
}
