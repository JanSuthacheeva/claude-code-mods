import { expect, test } from 'claude-code/testing'

import { superpowersPlan } from './fixtures'
import { parseOutline } from './outline'
import { paneModel, relativeAge } from './pane'
import { emptyProgress, withReport } from './progress'

const outline = parseOutline(superpowersPlan)
const plan = '/repo/docs/plans/github.md'
const minute = 60_000

test('expands only the active group and falls back to the first open item as Next', () => {
  const model = paneModel(plan, outline, emptyProgress(plan), 0, 40)

  expect(model.focus).toEqual({
    label: 'Next',
    ref: '2.2',
    text: 'Step 2: Implement rollupStatus',
    note: null,
    age: null,
  })
  expect(model.groups.map(group => `${group.state} ${group.items === null ? 'collapsed' : 'open'}`)).toEqual([
    'done collapsed',
    'active open',
    'open collapsed',
  ])
})

test('shows the reported item as Now with its note, age and the item after it', () => {
  const progress = withReport(emptyProgress(plan), {
    ref: '2.2',
    text: 'Step 2: Implement rollupStatus',
    status: 'doing',
    note: '3 red tests',
    at: 0,
  })

  const model = paneModel(plan, outline, progress, 2 * minute, 40)

  expect(model.focus).toEqual(expect.objectContaining({ label: 'Now', note: '3 red tests', age: '2m' }))
  expect(model.next?.ref).toBe('2.3')
  expect(model.groups[1]?.items?.map(item => item.state)).toEqual(['done', 'active', 'open'])
})

test('lists finished reports under Recent by item, without the current one', () => {
  let progress = withReport(emptyProgress(plan), {
    ref: '2.1',
    text: 'Step 1: Failing tests',
    status: 'done',
    note: 'kept the old fixture',
    at: 0,
  })
  progress = withReport(progress, { ref: '2.2', text: 'x', status: 'doing', note: null, at: minute })

  const model = paneModel(plan, outline, structuredClone(progress), 2 * minute, 40)

  expect(model.recent.map(row => `${row.age} ${row.status} ${row.ref} ${row.text}`)).toEqual([
    '2m done 2.1 Step 1: Failing tests',
  ])
})

test('marks a blocked item and its group', () => {
  const progress = withReport(emptyProgress(plan), { ref: '3.1', text: 'x', status: 'blocked', note: null, at: 0 })

  const model = paneModel(plan, outline, progress, 0, 40)

  expect(model.focus?.label).toBe('Blocked')
  expect(model.groups[2]?.state).toBe('blocked')
})

test('drops a current item that was ticked in the file meanwhile', () => {
  const progress = withReport(emptyProgress(plan), { ref: '2.1', text: 'x', status: 'doing', note: null, at: 0 })

  expect(paneModel(plan, outline, progress, 0, 40).focus?.label).toBe('Next')
})

test('scales the bar to the pane width and names the plan by title or file', () => {
  const model = paneModel(plan, outline, emptyProgress(plan), 0, 70)

  expect(model.bar).toEqual({ filled: 30, empty: 40 })
  expect(model.title).toBe('GitHub support')
  expect(paneModel(plan, parseOutline('- [ ] a'), emptyProgress(plan), 0, 10).title).toBe('github')
})

test('formats ages compactly', () => {
  expect(relativeAge(0, 30_000)).toBe('now')
  expect(relativeAge(0, 90 * minute)).toBe('1h')
  expect(relativeAge(0, 49 * 60 * minute)).toBe('2d')
})
