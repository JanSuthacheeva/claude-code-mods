import { expect, test } from 'claude-code/testing'

import type { FlowView, Navigation } from '../types'
import { bandModel, cardColumns, flowMark, parseBoard, phaseSteps, shortDuration, stateLabel, stateTone } from './board'
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

const all: Navigation = { tab: null, cursor: 0, offset: 0 }

function tabOf(name: string, offset = 0): Navigation {
  return { tab: flowNamed(name).id, cursor: 0, offset }
}

test('puts 3 cards in a row from 120 columns, 2 from 78, else 1', () => {
  expect([160, 120, 119, 78, 77, 40].map(cardColumns)).toEqual([3, 3, 2, 2, 1, 1])
})

test('draws All first, then one tab per flow with its mark and digit', () => {
  const model = bandModel(demoBoard, all, 120)

  expect(model.tabs.map(tab => [tab.hotkey, tab.label, tab.mark, tab.markTone, tab.isActive])).toEqual([
    ['0', 'All', null, 'text', true],
    ['1', 'shop-221', '●', 'error', false],
    ['2', 'shop-230', '●', 'warning', false],
    ['3', 'export-csv', null, 'claude', false],
    ['4', 'shop-198', '✓', 'success', false],
  ])
  expect(model.moreFlows).toBe(0)
  expect(model.needsYou).toEqual({ text: '2 need you', tone: 'warning' })
  expect(bandModel(demoBoard, all, 100).needsYou).toEqual({ text: '2', tone: 'warning' })
})

test('gives nine flows a tab and counts the rest', () => {
  const flows = Array.from({ length: 11 }, (_, index) => ({ ...flowNamed('shop-230'), id: `f${String(index)}`, name: `f${String(index)}` }))

  const model = bandModel({ ...demoBoard, flows, count: 11 }, all, 120)

  expect(model.tabs.map(tab => tab.hotkey)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
  expect(model.moreFlows).toBe(2)
})

test('lays the flows out as cards in rows that fit the width', () => {
  expect(bandModel(demoBoard, all, 120).cards?.map(row => row.map(card => card.name))).toEqual([
    ['shop-221', 'shop-230', 'export-csv'],
    ['shop-198'],
  ])
  expect(bandModel(demoBoard, all, 100).cards?.map(row => row.length)).toEqual([2, 2])
  expect(bandModel(demoBoard, all, 100).detail).toBeNull()
})

test('shows on each card what needs saying: the blocker, the agent or the request', () => {
  const cards = bandModel(demoBoard, all, 160).cards?.flat() ?? []
  const byName = Object.fromEntries(cards.map(card => [card.name, card]))

  expect(byName['shop-221']?.line).toEqual({ text: 'Task 5: the migration needs a default value for exported_at', tone: 'error' })
  expect(byName['shop-221']?.borderTone).toBe('error')
  expect(byName['shop-221']?.state).toEqual({ text: 'blocked', tone: 'error' })
  expect(byName['shop-221']?.railLabel).toBe('implement')
  expect(byName['shop-221']?.key).toBe(`row-${flowNamed('shop-221').id}`)
  expect(byName['export-csv']?.line).toEqual({ text: 'agent: review changes', tone: 'subtle' })
  expect(byName['export-csv']?.borderTone).toBe('inactive')
  expect(byName['shop-198']?.line).toEqual({ text: 'SHOP-198 fix rounding on invoices', tone: 'subtle' })
  expect(byName['shop-198']?.railLabel).toBe('done')
  expect(byName['shop-230']?.age).toBe(shortDuration(demoBoard.now - flowNamed('shop-230').changedAt))
})

test("shows one flow's state, steps, blocker, newest timeline and decisions on its tab", () => {
  const model = bandModel(demoBoard, tabOf('shop-221'), 120)
  const detail = model.detail

  expect(model.cards).toBeNull()
  expect(model.tabs.find(tab => tab.isActive)?.label).toBe('shop-221')
  expect(detail?.state).toEqual({ text: 'blocked', tone: 'error' })
  expect(detail?.mode).toEqual({ text: 'auto', tone: 'subtle' })
  expect(detail?.started).toBe(`started ${shortDuration(demoBoard.now - flowNamed('shop-221').startedAt)} ago`)
  expect(detail?.blocker).toEqual({ badge: '!', text: 'Task 5: the migration needs a default value for exported_at', tone: 'error' })
  expect(detail?.timeline.map(entry => [entry.glyph, entry.text, entry.tone])).toEqual([
    ['◉', 'blocked: Task 5: the migration needs a default value for exported_at', 'error'],
    ['○', 'phase: implement', 'text'],
    ['○', 'decided: approach B: stream rows instead of building the file in memory', 'subtle'],
  ])
  expect(detail?.older).toBe(2)
  expect(detail?.decisions).toEqual(['approach B: stream rows instead of building the file in memory'])
  expect(bandModel(demoBoard, tabOf('shop-230'), 120).detail?.blocker?.badge).toBe('?')
})

test('moves the timeline window with the offset and counts what is older', () => {
  const detail = bandModel(demoBoard, tabOf('shop-221', 2), 120).detail

  expect(detail?.timeline.map(entry => entry.glyph)).toEqual(['○', '○', '○'])
  expect(detail?.timeline[0]?.text).toBe('decided: approach B: stream rows instead of building the file in memory')
  expect(detail?.older).toBe(0)
})

test('falls back to All for a tab whose flow is gone', () => {
  const model = bandModel(demoBoard, { tab: 'gone', cursor: 0, offset: 0 }, 120)

  expect(model.detail).toBeNull()
  expect(model.cards).not.toBeNull()
  expect(model.tabs[0]?.isActive).toBe(true)
})
