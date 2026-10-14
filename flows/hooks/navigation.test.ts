import { expect, test } from 'claude-code/testing'

import type { Navigation } from '../types'
import { demoBoard } from './fixtures'
import { currentFlow, jumpTo, moveCursor, reconcile, scrollTimeline, start, stepTab, toTop } from './navigation'

const ids = demoBoard.flows.map(flow => flow.id)
const shop221 = ids[0] ?? ''

function on(tab: string | null, cursor = 0, offset = 0): Navigation {
  return { tab, cursor, offset }
}

test('jumps to All with 0 and to the flow in a tab with its digit', () => {
  expect(jumpTo(demoBoard, on(null, 2), 1)).toEqual(on(shop221, 2))
  expect(jumpTo(demoBoard, on(shop221, 0, 2), 4)).toEqual(on(ids[3] ?? ''))
  expect(jumpTo(demoBoard, on(shop221, 1), 0)).toEqual(on(null, 1))
  expect(jumpTo(demoBoard, on(shop221), 7)).toEqual(on(shop221))
})

test('steps through the tabs with h and l, wrapping around', () => {
  expect(stepTab(demoBoard, start, 1)).toEqual(on(shop221))
  expect(stepTab(demoBoard, start, -1)).toEqual(on(ids[3] ?? ''))
  expect(stepTab(demoBoard, on(ids[3] ?? '', 0, 1), 1)).toEqual(on(null))
})

test('moves the cursor over the cards with j and k, within the board', () => {
  expect(moveCursor(demoBoard, start, 1)).toEqual(on(null, 1))
  expect(moveCursor(demoBoard, start, -1)).toEqual(start)
  expect(moveCursor(demoBoard, on(null, 3), 1)).toEqual(on(null, 3))
  expect(moveCursor(demoBoard, on(shop221), 1)).toEqual(on(shop221))
})

test('scrolls the timeline of the open flow with j and k, within its entries', () => {
  expect(scrollTimeline(demoBoard, on(shop221), 1)).toEqual(on(shop221, 0, 1))
  expect(scrollTimeline(demoBoard, on(shop221, 0, 2), 1)).toEqual(on(shop221, 0, 2))
  expect(scrollTimeline(demoBoard, on(shop221), -1)).toEqual(on(shop221))
  expect(scrollTimeline(demoBoard, start, 1)).toEqual(start)
})

test('goes back to the top with g', () => {
  expect(toTop(on(null, 3))).toEqual(on(null, 0))
  expect(toTop(on(shop221, 2, 2))).toEqual(on(shop221, 2, 0))
})

test('falls back to All when the open flow is cleared and keeps the cursor on the board', () => {
  expect(reconcile(demoBoard, on('gone', 1, 2))).toEqual(on(null, 1))
  expect(reconcile(demoBoard, on(null, 9))).toEqual(on(null, 3))
  expect(reconcile({ ...demoBoard, flows: [] }, on(null, 2))).toEqual(start)
  expect(reconcile(demoBoard, on(shop221, 0, 9))).toEqual(on(shop221, 0, 2))
})

test('names the open flow, or the one under the cursor on All', () => {
  expect(currentFlow(demoBoard, on(shop221, 3))?.name).toBe('shop-221')
  expect(currentFlow(demoBoard, on(null, 1))?.name).toBe('shop-230')
  expect(currentFlow({ ...demoBoard, flows: [] }, start)).toBeNull()
})
