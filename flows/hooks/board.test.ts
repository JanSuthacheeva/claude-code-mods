import { expect, test } from 'claude-code/testing'

import type { FlowView } from '../types'
import { flowMark, parseBoard, phaseSteps, shortDuration, stateLabel, stateTone } from './board'
import { demoBoard } from './fixtures'

const minute = 60_000

function flowNamed(name: string): FlowView {
  const flow = demoBoard.flows.find(candidate => candidate.name === name)
  if (!flow) throw new Error(`no fixture flow ${name}`)
  return flow
}

function withState(state: FlowView['state'], phase: FlowView['phase'] = 'implement'): FlowView {
  return { ...flowNamed('shop-221'), state, phase }
}

test('parses the board flow prints and refuses other versions and other output', () => {
  expect(parseBoard(JSON.stringify(demoBoard))).toEqual(demoBoard)
  expect(parseBoard(JSON.stringify({ ...demoBoard, version: 2 }))).toEqual({ kind: 'unsupported', version: 2 })
  expect(parseBoard('error: no flow named x')).toEqual({ kind: 'failed', message: 'flow printed something that is not a board' })
  expect(parseBoard('{"version":1}')).toEqual({ kind: 'failed', message: 'flow printed something that is not a board' })
})

test('labels a flow by what it is doing', () => {
  expect(stateLabel(withState('working', 'design'))).toBe('designing')
  expect(stateLabel(withState('working', 'merge-request'))).toBe('writing MR')
  expect(stateLabel(withState('working', null))).toBe('starting')
  expect(stateLabel(withState('delegated', 'review'))).toBe('reviewing · agent')
  expect(stateLabel(withState('waiting'))).toBe('waiting for you')
  expect(stateLabel(withState('blocked'))).toBe('blocked')
  expect(stateLabel(withState('not-responding'))).toBe('not responding')
  expect(stateLabel(withState('done'))).toBe('MR open')
  expect(stateLabel(withState('ended'))).toBe('ended')
})

test('gives each state its theme tone and its mark', () => {
  const states: FlowView['state'][] = ['working', 'delegated', 'waiting', 'blocked', 'not-responding', 'done', 'ended']

  expect(states.map(state => stateTone(withState(state)))).toEqual([
    'claude',
    'claude',
    'warning',
    'error',
    'error',
    'success',
    'subtle',
  ])
  expect(states.map(state => flowMark(withState(state)))).toEqual([null, null, '●', '●', '●', '✓', '–'])
})

test('draws done phases green, the current one in the state tone and open ones dim', () => {
  const steps = phaseSteps(flowNamed('shop-221'))

  expect(steps.map(step => [step.label, step.glyph, step.tone, step.isCurrent])).toEqual([
    ['design', '●', 'success', false],
    ['implement', '◉', 'error', true],
    ['review', '○', 'inactive', false],
    ['MR', '○', 'inactive', false],
  ])
  expect(steps[0]?.duration).toBe('9m')
  expect(steps[2]?.duration).toBe('')
})

test('lights every phase of a finished flow', () => {
  expect(phaseSteps(flowNamed('shop-198')).map(step => step.glyph)).toEqual(['●', '●', '●', '●'])
  expect(phaseSteps(flowNamed('shop-198')).every(step => step.tone === 'success')).toBe(true)
})

test('shortens durations to one unit', () => {
  expect(shortDuration(0)).toBe('0s')
  expect(shortDuration(45_000)).toBe('45s')
  expect(shortDuration(12 * minute + 59_000)).toBe('12m')
  expect(shortDuration(3 * 60 * minute)).toBe('3h')
  expect(shortDuration(49 * 60 * minute)).toBe('2d')
})
