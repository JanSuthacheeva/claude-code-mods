import type { MergeRequest, Pipeline, PipelineStatus, ResolvedPipeline } from '../types'
import type { MergeRequestDetails } from './forge'

export interface PipelineContext {
  pushedSha: string | null
  isWithinPushGrace: boolean
  hadPipeline: boolean
}

export type FinishedMergeRequest = MergeRequest & { pipeline: ResolvedPipeline }

const runningStatuses = new Set<Pipeline['status']>(['awaiting', 'running'])
const failedStatuses = new Set<Pipeline['status']>(['failed', 'canceled'])

const runningPollMs = 30_000
const failedPollMs = 2 * 60_000

export function isRunning(pipeline: Pipeline | null): boolean {
  return pipeline !== null && runningStatuses.has(pipeline.status)
}

export function hasFailed(pipeline: Pipeline | null): boolean {
  return pipeline !== null && failedStatuses.has(pipeline.status)
}

export function resolvePipeline(details: MergeRequestDetails, context: PipelineContext): Pipeline | null {
  const pipeline = details.headPipeline
  const isPushPending = context.isWithinPushGrace && context.pushedSha !== null && details.sha !== context.pushedSha
  if (pipeline !== null && pipeline.sha === details.sha && !isPushPending) {
    return { status: pipeline.status, id: pipeline.id, url: pipeline.url }
  }

  const isNewPipelineExpected = context.isWithinPushGrace && (pipeline !== null || context.hadPipeline)
  return isNewPipelineExpected ? { status: 'awaiting' } : null
}

export function needsPolling(mr: MergeRequest): boolean {
  return mr.state === 'open' && (isRunning(mr.pipeline) || hasFailed(mr.pipeline))
}

export function pollIntervalMs(mergeRequests: readonly MergeRequest[]): number | null {
  const polled = mergeRequests.filter(needsPolling)
  if (polled.some(mr => isRunning(mr.pipeline))) return runningPollMs
  return polled.length > 0 ? failedPollMs : null
}

function newlyReached(
  status: PipelineStatus,
  before: readonly MergeRequest[],
  after: readonly MergeRequest[],
): FinishedMergeRequest[] {
  const previous = new Map(before.map(mr => [mr.number, mr.pipeline]))
  const hasReached = (mr: MergeRequest): mr is FinishedMergeRequest => mr.pipeline?.status === status
  return after.filter(hasReached).filter(mr => isRunning(previous.get(mr.number) ?? null))
}

export function newlyFailed(before: readonly MergeRequest[], after: readonly MergeRequest[]): FinishedMergeRequest[] {
  return newlyReached('failed', before, after)
}

export function newlyPassed(before: readonly MergeRequest[], after: readonly MergeRequest[]): FinishedMergeRequest[] {
  return newlyReached('passed', before, after)
}
