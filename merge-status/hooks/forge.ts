import type { ForgeName, MergeRequest, ResolvedPipeline } from '../types'
import { remoteHost } from './git'
import { github } from './github'
import { gitlab } from './gitlab'
import type { FailedMergeRequest } from './pipelines'

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
  sigil: '!' | '#'
  logo: string
  notInstalledMessage: string
  notLoggedInMessage: string
  listArgv(sourceBranch: string): string[]
  parseMergeRequests(json: string): MergeRequest[]
  detailsArgv(mr: MergeRequest): string[]
  parseDetails(json: string): MergeRequestDetails
  describeFailure(output: string): string
  investigationPrompt(mr: FailedMergeRequest, sourceBranch: string): string
}

const forges: Record<ForgeName, Forge> = { gitlab, github }

export function forgeNamed(name: ForgeName): Forge {
  return forges[name]
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
