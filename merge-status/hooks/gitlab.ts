import type { MergeRequest, MergeRequestState, PipelineStatus } from '../types'
import type { Forge, MergeRequestDetails } from './forge'
import type { FinishedMergeRequest } from './pipelines'

type ApiMergeRequestState = 'opened' | 'merged' | 'closed' | 'locked'

type ApiPipelineStatus =
  | 'created'
  | 'waiting_for_resource'
  | 'preparing'
  | 'pending'
  | 'running'
  | 'scheduled'
  | 'manual'
  | 'success'
  | 'failed'
  | 'canceled'
  | 'skipped'

interface ApiMergeRequest {
  iid: number
  project_id: number
  state: ApiMergeRequestState
  draft?: boolean
  target_branch: string
  web_url: string
}

interface ApiPipeline {
  id: number
  status: ApiPipelineStatus
  sha: string
  web_url: string
}

interface ApiMergeRequestDetails {
  sha: string
  has_conflicts: boolean
  head_pipeline: ApiPipeline | null
}

const listLimit = 20

export const notInstalledMessage = 'glab is not installed - see https://gitlab.com/gitlab-org/cli#installation'
export const notLoggedInMessage = 'glab is not logged in to this GitLab host - run: glab auth login'

const notLoggedInOutput = /glab auth login|401 Unauthorized/i
const bannerLine = /^ERROR$/

const states: Record<ApiMergeRequestState, MergeRequestState> = {
  opened: 'open',
  merged: 'merged',
  closed: 'closed',
  locked: 'closed',
}

const pipelineStatuses: Record<ApiPipelineStatus, PipelineStatus> = {
  created: 'running',
  waiting_for_resource: 'running',
  preparing: 'running',
  pending: 'running',
  running: 'running',
  scheduled: 'running',
  manual: 'idle',
  success: 'passed',
  failed: 'failed',
  canceled: 'canceled',
  skipped: 'idle',
}

export function describeFailure(output: string): string {
  if (notLoggedInOutput.test(output)) return notLoggedInMessage

  const lines = output.split('\n').map(line => line.trim())
  return lines.find(line => line !== '' && !bannerLine.test(line)) ?? 'glab failed'
}

export function listArgv(sourceBranch: string): string[] {
  return [
    'glab',
    'mr',
    'list',
    '--source-branch',
    sourceBranch,
    '--all',
    '--output',
    'json',
    '--per-page',
    String(listLimit),
  ]
}

export function detailsArgv(mr: MergeRequest): string[] {
  return ['glab', 'api', `projects/${mr.project}/merge_requests/${String(mr.number)}`]
}

export function parseMergeRequests(json: string): MergeRequest[] {
  const listed = JSON.parse(json) as ApiMergeRequest[]
  return listed.map(mr => ({
    number: mr.iid,
    project: String(mr.project_id),
    state: states[mr.state],
    isDraft: mr.draft ?? false,
    targetBranch: mr.target_branch,
    url: mr.web_url,
    pipeline: null,
    hasConflicts: false,
  }))
}

export function pipelineStatus(status: ApiPipelineStatus): PipelineStatus {
  return pipelineStatuses[status]
}

export function parseDetails(json: string): MergeRequestDetails {
  const details = JSON.parse(json) as ApiMergeRequestDetails
  const pipeline = details.head_pipeline
  return {
    sha: details.sha,
    hasConflicts: details.has_conflicts,
    headPipeline: pipeline && {
      status: pipelineStatus(pipeline.status),
      id: String(pipeline.id),
      sha: pipeline.sha,
      url: pipeline.web_url,
    },
  }
}

export function investigationPrompt(mr: FinishedMergeRequest, sourceBranch: string): string {
  const { project, pipeline } = mr
  const failedJobs = `glab api 'projects/${project}/pipelines/${pipeline.id}/jobs?scope=failed'`
  const jobLog = `glab api projects/${project}/jobs/<job-id>/trace`

  return [
    `The GitLab pipeline ${pipeline.url} of MR !${String(mr.number)} (${sourceBranch} → ${mr.targetBranch}) just failed.`,
    `Investigate why: list its failed jobs with \`${failedJobs}\` and read each job's log with \`${jobLog}\`.`,
    'Report the root cause and the files or tests involved.',
    'Investigate only: do not change code, commit, push or retry the pipeline.',
  ].join('\n')
}

export const gitlab: Forge = {
  name: 'gitlab',
  cli: 'glab',
  noun: 'MR',
  pipelineNoun: 'pipeline',
  sigil: '!',
  logo: '\u{f0ba0} ',
  notInstalledMessage,
  notLoggedInMessage,
  listArgv,
  parseMergeRequests,
  detailsArgv,
  parseDetails,
  describeFailure,
  investigationPrompt,
}
