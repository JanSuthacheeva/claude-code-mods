import type { MergeRequest, MergeRequestState, PipelineStatus } from '../types'

interface ApiMergeRequest {
  iid: number
  project_id: number
  state: MergeRequestState
  draft?: boolean
  target_branch: string
  web_url: string
}

interface ApiPipeline {
  id: number
  status: PipelineStatus
  sha: string
  web_url: string
}

export interface MergeRequestDetails {
  sha: string
  has_conflicts: boolean
  head_pipeline: ApiPipeline | null
}

const listLimit = 20

export const notInstalledMessage = 'glab is not installed - see https://gitlab.com/gitlab-org/cli#installation'
export const notLoggedInMessage = 'glab is not logged in to this GitLab host - run: glab auth login'

const notLoggedInOutput = /glab auth login|401 Unauthorized/i
const bannerLine = /^ERROR$/

export function describeGlabFailure(output: string): string {
  if (notLoggedInOutput.test(output)) return notLoggedInMessage

  const lines = output.split('\n').map(line => line.trim())
  return lines.find(line => line !== '' && !bannerLine.test(line)) ?? 'glab failed'
}

export function describeGlabError(error: unknown): string {
  const message = String(error)
  if (message.includes('ENOENT')) return notInstalledMessage
  if (message.includes('still running')) return 'glab did not answer in time'
  return message
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
  return ['glab', 'api', `projects/${String(mr.projectId)}/merge_requests/${String(mr.iid)}`]
}

export function parseMergeRequests(json: string): MergeRequest[] {
  const listed = JSON.parse(json) as ApiMergeRequest[]
  return listed.map(mr => ({
    iid: mr.iid,
    projectId: mr.project_id,
    state: mr.state,
    isDraft: mr.draft ?? false,
    targetBranch: mr.target_branch,
    url: mr.web_url,
    pipeline: null,
    hasConflicts: false,
  }))
}

export function parseDetails(json: string): MergeRequestDetails {
  return JSON.parse(json) as MergeRequestDetails
}
