import type { Observation, Phase } from '../types'

/** The skills whose start means a flow entered a phase; any other skill reports nothing. */
export const phaseBySkill: Readonly<Record<string, Phase>> = {
  'design-code': 'design',
  'implement-plan': 'implement',
  'review-changes': 'review',
  'write-merge-request': 'merge-request',
}

/** Longest text sent as a waiting question or block reason. */
export const reportTextLimit = 200

/** The arguments after `flow report --flow <id>` for one observation, or null for none. */
export function reportArgs(observation: Observation): string[] | null {
  switch (observation.kind) {
    case 'skill': {
      const phase = phaseOfSkill(observation.skill)
      return phase === null ? null : ['phase', phase]
    }
    case 'delegated':
      return ['delegated', cut(observation.description)]
    case 'agent-done':
    case 'answered':
    case 'turn-start':
      return ['working']
    case 'question':
      return ['waiting', cut(observation.text)]
    case 'turn-end':
      return ['waiting', waitingQuestion(observation.answer) ?? 'turn ended']
    case 'plan-report': {
      if (observation.status === 'blocked') {
        const reason = observation.note === null ? observation.item : `${observation.item}: ${observation.note}`
        return ['blocked', cut(reason)]
      }
      const counts = taskCounts(observation.result)
      return counts === null ? null : ['tasks', String(counts.done), String(counts.total)]
    }
    case 'command': {
      const url = createdMergeRequest(observation.command, observation.stdout)
      return url === null ? null : ['merge-request', url]
    }
    case 'session-end':
      // A hangup (flow ui stopping, a reboot) leaves the flow unfinished, so it is resumed.
      return observation.reason === 'prompt_input_exit' ? ['ended'] : null
    case 'heartbeat':
      return ['heartbeat']
  }
}

/** A skill's phase, also for a plugin-prefixed name (buzzwoo-standard:design-code). */
export function phaseOfSkill(skill: string): Phase | null {
  const name = skill.replace(/^\//, '').split(':').pop() ?? ''
  return phaseBySkill[name] ?? null
}

/** The last non-empty line of the answer, cut to the limit; null for an empty answer. */
export function waitingQuestion(answer: string): string | null {
  const lines = answer
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')
  const last = lines[lines.length - 1]
  if (last === undefined) return null
  const sentences = plain(last).split(/(?<=[.!?])\s+/)
  const question = sentences.filter(sentence => sentence.endsWith('?')).pop()
  return cut(question ?? sentences.pop() ?? last)
}

/** A Markdown line as plain text: no list marker, emphasis or code ticks. */
function plain(line: string): string {
  return line
    .replace(/^([-*+]|\d+\.)\s+/, '')
    .replace(/[*_`]+/g, '')
    .trim()
}

/** The skill a typed slash command names (`/design-code ...`), which raises no skill.prompt. */
export function typedSkill(text: string): string | null {
  return /^\/(\S+)/.exec(text.trim())?.[1] ?? null
}

/** "4/9 done" or "all 9 done" in a plan-progress report result. */
export function taskCounts(result: string): { done: number; total: number } | null {
  const some = /ok, (\d+)\/(\d+) done/.exec(result)
  if (some) return { done: Number(some[1]), total: Number(some[2]) }
  const all = /ok, all (\d+) done/.exec(result)
  return all ? { done: Number(all[1]), total: Number(all[1]) } : null
}

/** The MR or PR URL a gh pr create / glab mr create printed, when the command was one. */
export function createdMergeRequest(command: string, stdout: string): string | null {
  if (!mergeRequestCreation.test(command)) return null
  return /https?:\/\/\S+/.exec(stdout)?.[0] ?? null
}

/** gh pr create / glab mr create, as merge-status/hooks/git.ts spells it. */
const mergeRequestCreation = /\b(?:glab\s+mr|gh\s+pr)\s+(?:create|new)\b/

function cut(text: string): string {
  return [...text].slice(0, reportTextLimit).join('')
}
