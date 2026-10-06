export interface Location {
  repo: string
  branch: string
}

export interface Fingerprint {
  key: string
  upstreamSha: string | null
}

const triggeringCommand = /\bgit\b(?:\s+-C\s+\S+)?\s+(?:checkout|switch|push|pull)\b|\bglab\s+mr\s+(?:create|new)\b/

export function isTriggeringCommand(command: string): boolean {
  return triggeringCommand.test(command)
}

export function isGitlabRemote(remoteUrl: string | null): remoteUrl is string {
  return remoteUrl !== null && !remoteUrl.includes('github.com')
}

export function remoteBranchName(upstreamRef: string | null, localBranch: string): string {
  const slash = upstreamRef?.indexOf('/') ?? -1
  return upstreamRef !== null && slash > 0 ? upstreamRef.slice(slash + 1) : localBranch
}

export function toFingerprint(head: string | null, upstreamSha: string | null): Fingerprint {
  return { key: `${head ?? ''}\n${upstreamSha ?? ''}`, upstreamSha }
}
