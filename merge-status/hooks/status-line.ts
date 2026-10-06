import type { BranchStatus, IconStyle, MergeRequest, Pipeline } from '../types'
import { forgeNamed } from './forge'
import type { Forge } from './forge'
import { hasFailed, isRunning } from './pipelines'

export type ThemeColor = 'text' | 'subtle' | 'inactive' | 'claude' | 'success' | 'warning' | 'error'

export interface Segment {
  text: string
  color: ThemeColor
  href?: string
}

const space: Segment = { text: ' ', color: 'text' }
const separator: Segment = { text: ' · ', color: 'subtle' }
const conflictSign: Segment = { text: '⚠', color: 'error' }

function pipelineSign(pipeline: Pipeline | null): Segment {
  if (pipeline?.status === 'passed') return { text: '✓', color: 'success' }
  if (isRunning(pipeline)) return { text: '⟳', color: 'warning' }
  if (hasFailed(pipeline)) return { text: '✗', color: 'error' }
  return { text: '○', color: 'inactive' }
}

function mergeRequestSegments(forge: Forge, mr: MergeRequest): Segment[] {
  const signs = mr.hasConflicts ? [pipelineSign(mr.pipeline), conflictSign] : [pipelineSign(mr.pipeline)]
  return [
    { text: `${forge.sigil}${String(mr.number)}`, color: 'claude', href: mr.url },
    space,
    mr.isDraft ? { text: 'draft', color: 'warning' } : { text: 'open', color: 'success' },
    { text: ' → ', color: 'subtle' },
    { text: mr.targetBranch, color: 'text' },
    ...signs.flatMap(sign => [space, sign]),
  ]
}

export function iconStyleFrom(option: unknown): IconStyle {
  return option === 'text' ? 'text' : 'nerd-font'
}

export function statusSegments(status: BranchStatus, iconStyle: IconStyle): Segment[] | null {
  if (status.branch === null || status.forge === null) return null

  const forge = forgeNamed(status.forge)
  const label: Segment = { text: iconStyle === 'text' ? forge.noun : forge.logo, color: 'text' }
  if (status.error !== null) return [label, { text: ` ${status.error.split('\n')[0] ?? ''}`, color: 'error' }]
  if (status.mergeRequests === null) return [label, { text: ' loading...', color: 'inactive' }]
  if (status.mergeRequests.length === 0) return [label, { text: ' none', color: 'inactive' }]

  const entries = status.mergeRequests.map(mr => mergeRequestSegments(forge, mr))
  return [label, space, ...entries.flatMap((entry, index) => (index === 0 ? entry : [separator, ...entry]))]
}
