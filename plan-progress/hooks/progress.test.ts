import { expect, test } from 'claude-code/testing'

import type { Report } from '../types'
import { flatPlan } from './fixtures'
import { parseOutline } from './outline'
import { absolutePath, emptyProgress, summaryLine, withReport } from './progress'

function reportOf(ref: string, status: Report['status'], at: number): Report {
  return { ref, text: `item ${ref}`, status, note: null, at }
}

test('resolves plan paths against the working directory', () => {
  expect(absolutePath('/repo', 'docs/plans/x.md')).toBe('/repo/docs/plans/x.md')
  expect(absolutePath('/repo/', './x.md')).toBe('/repo/x.md')
  expect(absolutePath('/repo', '/abs/x.md')).toBe('/abs/x.md')
})

test('a doing report becomes current, done clears it, recent keeps one row per item', () => {
  let progress = emptyProgress('/repo/plan.md')

  progress = withReport(progress, reportOf('2', 'doing', 1))
  expect(progress.current?.ref).toBe('2')

  progress = withReport(progress, reportOf('2', 'done', 2))
  expect(progress.current).toBeNull()
  expect(progress.recent.map(one => `${one.ref} ${one.status}`)).toEqual(['2 done'])
})

test('done on another item keeps the current one', () => {
  let progress = withReport(emptyProgress('/p.md'), reportOf('3', 'doing', 1))

  progress = withReport(progress, reportOf('1', 'done', 2))

  expect(progress.current?.ref).toBe('3')
})

test('recent keeps the last four items, one more than the pane shows', () => {
  let progress = emptyProgress('/p.md')
  for (const [index, ref] of ['1', '2', '3', '4', '5'].entries()) {
    progress = withReport(progress, reportOf(ref, 'done', index))
  }

  expect(progress.recent.map(one => one.ref)).toEqual(['5', '4', '3', '2'])
})

test('summarizes counts and the next item', () => {
  expect(summaryLine(parseOutline(flatPlan), null)).toBe('ok, 1/3 done - next: 2 T2. Back office lists')
  expect(summaryLine(parseOutline('- [x] one'), null)).toBe('ok, all 1 done - plan complete')
})

test('names the item after the one being worked on', () => {
  const outline = parseOutline(flatPlan)

  expect(summaryLine(outline, reportOf('2', 'doing', 0))).toBe('ok, 1/3 done - after this: 3 T3. Connect payload')
  expect(summaryLine(outline, reportOf('3', 'blocked', 0))).toBe('ok, 1/3 done - after this: 2 T2. Back office lists')
})

test('says when the item being worked on is the last open one', () => {
  const outline = parseOutline('- [x] one\n- [ ] two')

  expect(summaryLine(outline, reportOf('2', 'doing', 0))).toBe('ok, 1/2 done - this is the last open item')
})
