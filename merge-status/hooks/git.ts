import type { ForgeName } from '../types'

export interface Location {
  repo: string
  branch: string
  forge: ForgeName
}

export interface Fingerprint {
  key: string
  upstreamSha: string | null
}

const urlRemote = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^:/]+)/i
const scpRemote = /^(?:[^@/]+@)?([^:/\\]{2,}):(?!\/\/)/
const triggeringCommand = /\bgit\b(?:\s+-C\s+\S+)?\s+(?:checkout|switch|push|pull)\b|\b(?:glab\s+mr|gh\s+pr)\s+(?:create|new)\b/

export function isTriggeringCommand(command: string): boolean {
  return triggeringCommand.test(command)
}

export function remoteHost(remoteUrl: string): string | null {
  const host = urlRemote.exec(remoteUrl)?.[1] ?? scpRemote.exec(remoteUrl)?.[1]
  return host?.toLowerCase() ?? null
}

export function remoteBranchName(upstreamRef: string | null, localBranch: string): string {
  const slash = upstreamRef?.indexOf('/') ?? -1
  return upstreamRef !== null && slash > 0 ? upstreamRef.slice(slash + 1) : localBranch
}

export function toFingerprint(head: string | null, upstreamSha: string | null): Fingerprint {
  return { key: `${head ?? ''}\n${upstreamSha ?? ''}`, upstreamSha }
}
