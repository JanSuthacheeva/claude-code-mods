import type { FailedMergeRequest } from './pipelines'

export function investigationPrompt(mr: FailedMergeRequest, sourceBranch: string): string {
  const { projectId, pipeline } = mr
  const failedJobs = `glab api 'projects/${String(projectId)}/pipelines/${String(pipeline.id)}/jobs?scope=failed'`
  const jobLog = `glab api projects/${String(projectId)}/jobs/<job-id>/trace`

  return [
    `The GitLab pipeline ${pipeline.url} of MR !${String(mr.iid)} (${sourceBranch} → ${mr.targetBranch}) just failed.`,
    `Investigate why: list its failed jobs with \`${failedJobs}\` and read each job's log with \`${jobLog}\`.`,
    'Report the root cause and the files or tests involved.',
    'Investigate only: do not change code, commit, push or retry the pipeline.',
  ].join('\n')
}
