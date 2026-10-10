import type { ForgeName, MergeRequest, ResolvedPipeline } from '../types'
import { remoteHost } from './git'
import { github } from './github'
import { gitlab } from './gitlab'
import type { FinishedMergeRequest } from './pipelines'

export interface HeadPipeline extends ResolvedPipeline {
  sha: string
}

export interface MergeRequestDetails {
  sha: string
  hasConflicts: boolean
  headPipeline: HeadPipeline | null
}

export interface Forge {
  name: ForgeName
  cli: 'glab' | 'gh'
  noun: 'MR' | 'PR'
  pipelineNoun: 'pipeline' | 'checks'
  sigil: '!' | '#'
  logo: string
  notInstalledMessage: string
  notLoggedInMessage: string
  listArgv(sourceBranch: string): string[]
  parseMergeRequests(json: string): MergeRequest[]
  detailsArgv(mr: MergeRequest): string[]
  parseDetails(json: string): MergeRequestDetails
  describeFailure(output: string): string
  investigationPrompt(mr: FinishedMergeRequest, sourceBranch: string): string
}

const forges: Record<ForgeName, Forge> = { gitlab, github }

export function forgeNamed(name: ForgeName): Forge {
  return forges[name]
}

export function passedLine(forge: Forge, mr: FinishedMergeRequest): string {
  return `${forge.noun} ${forge.sigil}${String(mr.number)} → ${mr.targetBranch}: ${forge.pipelineNoun} passed`
}

export function passedNote(forge: Forge, mr: FinishedMergeRequest, sourceBranch: string): string {
  const label = `${forge.noun} ${forge.sigil}${String(mr.number)} (${sourceBranch} → ${mr.targetBranch})`
  return [
    `Automatic note from the merge-status plugin, not written by the user: the ${forge.pipelineNoun} of ${label} passed: ${mr.pipeline.url}`,
    'For your information only: no action needed.',
  ].join('\n')
}

export function detectForge(remoteUrl: string | null): Forge | null {
  if (remoteUrl === null) return null

  const host = remoteHost(remoteUrl)
  if (host === null) return null
  return host === 'github.com' || host.startsWith('github.') ? github : gitlab
}

export function describeProcessError(forge: Forge, error: unknown): string {
  const message = String(error)
  if (message.includes('ENOENT')) return forge.notInstalledMessage
  if (message.includes('still running')) return `${forge.cli} did not answer in time`
  return message
}
