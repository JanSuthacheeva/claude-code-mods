import { expect, test } from 'claude-code/testing'

import type { PipelineStatus } from '../types'
import { mergeRequest } from './fixtures'
import type { MergeRequestDetails } from './forge'
import { newlyFailed, newlyPassed, pollIntervalMs, resolvePipeline } from './pipelines'

function details(sha: string, pipeline: { status: PipelineStatus; sha: string } | null): MergeRequestDetails {
  return {
    sha,
    hasConflicts: false,
    headPipeline: pipeline && { ...pipeline, id: '1', url: 'https://git.example/p/1' },
  }
}

const settled = { pushedSha: null, isWithinPushGrace: false, hadPipeline: true }
const justPushed = { pushedSha: 'new', isWithinPushGrace: true, hadPipeline: true }

test('uses the head pipeline when it belongs to the current commit', () => {
  expect(resolvePipeline(details('a', { status: 'running', sha: 'a' }), settled)).toEqual({
    status: 'running',
    id: '1',
    url: 'https://git.example/p/1',
  })
  expect(resolvePipeline(details('b', { status: 'passed', sha: 'a' }), settled)).toBeNull()
})

test('right after a push, an older pipeline means a new one is on its way', () => {
  const awaiting = { status: 'awaiting' }

  expect(resolvePipeline(details('old', { status: 'passed', sha: 'old' }), justPushed)).toEqual(awaiting)
  expect(resolvePipeline(details('new', { status: 'passed', sha: 'old' }), justPushed)).toEqual(awaiting)
  expect(resolvePipeline(details('new', { status: 'running', sha: 'new' }), justPushed)?.status).toBe('running')
  expect(resolvePipeline(details('new', null), { ...justPushed, hadPipeline: false })).toBeNull()
})

test('polls running pipelines every 30s and failed ones every 2 minutes, passed ones never', () => {
  const passed = mergeRequest({ number: 1, pipeline: { status: 'passed', id: '1', url: '' } })
  const failed = mergeRequest({ number: 2, pipeline: { status: 'failed', id: '2', url: '' } })
  const awaiting = mergeRequest({ number: 3, pipeline: { status: 'awaiting' } })
  const mergedWhileRunning = mergeRequest({
    number: 4,
    state: 'merged',
    pipeline: { status: 'running', id: '4', url: '' },
  })

  expect(pollIntervalMs([passed])).toBeNull()
  expect(pollIntervalMs([failed])).toBe(120_000)
  expect(pollIntervalMs([failed, awaiting])).toBe(30_000)
  expect(pollIntervalMs([mergedWhileRunning])).toBeNull()
})

test('reports a failure only for pipelines seen running before', () => {
  const running = mergeRequest({ number: 8, pipeline: { status: 'running', id: '77', url: '' } })
  const awaiting = mergeRequest({ number: 8, pipeline: { status: 'awaiting' } })
  const failed = mergeRequest({ number: 8, pipeline: { status: 'failed', id: '77', url: '' } })

  expect(newlyFailed([running], [failed])).toEqual([failed])
  expect(newlyFailed([awaiting], [failed])).toEqual([failed])
  expect(newlyFailed([failed], [failed])).toEqual([])
  expect(newlyFailed([], [failed])).toEqual([])
})

test('reports a pass only for pipelines seen running before', () => {
  const running = mergeRequest({ number: 8, pipeline: { status: 'running', id: '77', url: '' } })
  const awaiting = mergeRequest({ number: 8, pipeline: { status: 'awaiting' } })
  const passed = mergeRequest({ number: 8, pipeline: { status: 'passed', id: '77', url: '' } })
  const failed = mergeRequest({ number: 8, pipeline: { status: 'failed', id: '77', url: '' } })

  expect(newlyPassed([running], [passed])).toEqual([passed])
  expect(newlyPassed([awaiting], [passed])).toEqual([passed])
  expect(newlyPassed([passed], [passed])).toEqual([])
  expect(newlyPassed([], [passed])).toEqual([])
  expect(newlyPassed([running], [failed])).toEqual([])
})
