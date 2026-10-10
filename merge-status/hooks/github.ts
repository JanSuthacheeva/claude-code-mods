import type { MergeRequest, MergeRequestState, PipelineStatus } from '../types'
import type { Forge, MergeRequestDetails } from './forge'
import type { FinishedMergeRequest } from './pipelines'

type ApiPullRequestState = 'OPEN' | 'CLOSED' | 'MERGED'

interface ApiPullRequest {
  number: number
  state: ApiPullRequestState
  isDraft: boolean
  baseRefName: string
  url: string
}

interface ApiCheckRun {
  __typename: 'CheckRun'
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'WAITING' | 'PENDING' | 'REQUESTED'
  conclusion:
    | 'SUCCESS'
    | 'FAILURE'
    | 'CANCELLED'
    | 'SKIPPED'
    | 'NEUTRAL'
    | 'TIMED_OUT'
    | 'ACTION_REQUIRED'
    | 'STARTUP_FAILURE'
    | 'STALE'
    | ''
    | null
}

interface ApiStatusContext {
  __typename: 'StatusContext'
  state: 'EXPECTED' | 'PENDING' | 'SUCCESS' | 'FAILURE' | 'ERROR'
}

export type ApiCheck = ApiCheckRun | ApiStatusContext

interface ApiPullRequestDetails {
  headRefOid: string
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  statusCheckRollup: ApiCheck[]
  url: string
}

const listLimit = 20

export const notInstalledMessage = 'gh is not installed - see https://cli.github.com'
export const notLoggedInMessage = 'gh is not logged in to this GitHub host - run: gh auth login'

const notLoggedInOutput = /gh auth login|HTTP 401|Bad credentials/i
const pullRequestUrl = /^https?:\/\/([^/]+\/[^/]+\/[^/]+)\/pull\/\d+/

const states: Record<ApiPullRequestState, MergeRequestState> = {
  OPEN: 'open',
  MERGED: 'merged',
  CLOSED: 'closed',
}

const failedConclusions = new Set<ApiCheckRun['conclusion']>([
  'FAILURE',
  'TIMED_OUT',
  'STARTUP_FAILURE',
  'ACTION_REQUIRED',
])

function isPending(check: ApiCheck): boolean {
  return check.__typename === 'CheckRun'
    ? check.status !== 'COMPLETED'
    : check.state === 'PENDING' || check.state === 'EXPECTED'
}

function isFailed(check: ApiCheck): boolean {
  return check.__typename === 'CheckRun'
    ? failedConclusions.has(check.conclusion)
    : check.state === 'FAILURE' || check.state === 'ERROR'
}

function isCanceled(check: ApiCheck): boolean {
  return check.__typename === 'CheckRun' && check.conclusion === 'CANCELLED'
}

export function describeFailure(output: string): string {
  if (notLoggedInOutput.test(output)) return notLoggedInMessage

  const lines = output.split('\n').map(line => line.trim())
  return lines.find(line => line !== '') ?? 'gh failed'
}

export function listArgv(sourceBranch: string): string[] {
  return [
    'gh',
    'pr',
    'list',
    '--head',
    sourceBranch,
    '--state',
    'all',
    '--json',
    'number,state,isDraft,baseRefName,url',
    '--limit',
    String(listLimit),
  ]
}

export function detailsArgv(mr: MergeRequest): string[] {
  return [
    'gh',
    'pr',
    'view',
    String(mr.number),
    '--repo',
    mr.project,
    '--json',
    'headRefOid,mergeable,statusCheckRollup,url',
  ]
}

export function parsePullRequests(json: string): MergeRequest[] {
  const listed = JSON.parse(json) as ApiPullRequest[]
  return listed.map(pr => ({
    number: pr.number,
    project: pullRequestUrl.exec(pr.url)?.[1] ?? '',
    state: states[pr.state],
    isDraft: pr.isDraft,
    targetBranch: pr.baseRefName,
    url: pr.url,
    pipeline: null,
    hasConflicts: false,
  }))
}

export function rollupStatus(checks: readonly ApiCheck[]): PipelineStatus | null {
  if (checks.length === 0) return null
  if (checks.some(isPending)) return 'running'
  if (checks.some(isFailed)) return 'failed'
  if (checks.some(isCanceled)) return 'canceled'
  return 'passed'
}

export function parseDetails(json: string): MergeRequestDetails {
  const details = JSON.parse(json) as ApiPullRequestDetails
  const status = rollupStatus(details.statusCheckRollup)
  const sha = details.headRefOid
  return {
    sha,
    hasConflicts: details.mergeable === 'CONFLICTING',
    headPipeline: status && { status, id: sha, sha, url: `${details.url}/checks` },
  }
}

export function investigationPrompt(mr: FinishedMergeRequest, sourceBranch: string): string {
  const { project, pipeline } = mr
  const failedChecks = `gh pr checks ${String(mr.number)} --repo ${project}`
  const runLog = `gh run view <run-id> --repo ${project} --log-failed`

  return [
    `The GitHub checks of PR #${String(mr.number)} (${sourceBranch} → ${mr.targetBranch}) on commit ${pipeline.id.slice(0, 7)} just failed: ${pipeline.url}`,
    `Investigate why: list the failed checks with \`${failedChecks}\` and read each failed run's log with \`${runLog}\`.`,
    'Report the root cause and the files or tests involved.',
    'Investigate only: do not change code, commit, push or re-run the checks.',
  ].join('\n')
}

export const github: Forge = {
  name: 'github',
  cli: 'gh',
  noun: 'PR',
  pipelineNoun: 'checks',
  sigil: '#',
  logo: '\u{f02a4} ',
  notInstalledMessage,
  notLoggedInMessage,
  listArgv,
  parseMergeRequests: parsePullRequests,
  detailsArgv,
  parseDetails,
  describeFailure,
  investigationPrompt,
}
