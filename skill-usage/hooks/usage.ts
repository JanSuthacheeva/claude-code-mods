import type { SkillStats, Source, Usage } from '../types'

export type Counter = 'sessions' | 'prompts' | 'turns'

export interface RankedSkill {
  name: string
  user: number
  claude: number
  total: number
  lastUsed: string
}

const emptyStats: SkillStats = { user: 0, claude: 0, preload: 0, lastUsed: '' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function emptyUsage(now: number): Usage {
  return { since: new Date(now).toISOString(), sessions: 0, prompts: 0, turns: 0, skills: {} }
}

export function parseUsage(text: string | null, now: number): Usage {
  if (text === null) return emptyUsage(now)

  try {
    const parsed: unknown = JSON.parse(text)
    return isRecord(parsed) ? { ...emptyUsage(now), ...(parsed as Partial<Usage>) } : emptyUsage(now)
  } catch {
    return emptyUsage(now)
  }
}

export function serializeUsage(usage: Usage): string {
  return `${JSON.stringify(usage, null, 2)}\n`
}

export function withCount(usage: Usage, counter: Counter): Usage {
  return { ...usage, [counter]: usage[counter] + 1 }
}

export function withInvocation(usage: Usage, skill: string, source: Source, now: number): Usage {
  const stats = usage.skills[skill] ?? emptyStats
  const counted = { ...stats, [source]: stats[source] + 1, lastUsed: new Date(now).toISOString() }
  return { ...usage, skills: { ...usage.skills, [skill]: counted } }
}

export function rankedSkills(usage: Usage): RankedSkill[] {
  return Object.entries(usage.skills)
    .map(([name, stats]) => ({
      name,
      user: stats.user,
      claude: stats.claude,
      total: stats.user + stats.claude,
      lastUsed: stats.lastUsed,
    }))
    .filter(skill => skill.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}
