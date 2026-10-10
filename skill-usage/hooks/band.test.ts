import { expect, test } from 'claude-code/testing'

import { bandLayout, perHundred, relativeTime, stackedBar, thousands } from './band'
import { emptyUsage, withInvocation } from './usage'

const now = Date.parse('2026-10-10T08:00:00.000Z')

function ago(ms: number): string {
  return relativeTime(new Date(now - ms).toISOString(), now)
}

test('formats counts, rates and how long ago a skill was used', () => {
  expect(thousands(1204)).toBe('1,204')
  expect(perHundred(42, 340)).toBe('12.4')
  expect(perHundred(3, 0)).toBe('-')

  expect(ago(10_000)).toBe('just now')
  expect(ago(5 * 60_000)).toBe('5m ago')
  expect(ago(2 * 3_600_000)).toBe('2h ago')
  expect(ago(3 * 86_400_000)).toBe('3d ago')
  expect(ago(40 * 86_400_000)).toBe('2026-08-31')
  expect(relativeTime('', now)).toBe('-')
})

test('fills the bar with you first, then claude, then the track', () => {
  expect(stackedBar(2, 2, 4, 8)).toEqual({ you: '████', claude: '████', track: '' })
  expect(stackedBar(1, 0, 4, 8)).toEqual({ you: '██', claude: '', track: '──────' })
  expect(stackedBar(0, 1, 3, 8)).toEqual({ you: '', claude: '██▋', track: '─────' })
})

test('keeps at least a sliver of claude visible', () => {
  expect(stackedBar(100, 1, 101, 8).claude).toBe('▏')
})

test('grows the bar with the terminal up to a maximum, and the band hugs its columns', () => {
  const usage = withInvocation(emptyUsage(now), 'commit', 'user', now)

  expect(bandLayout(usage, 90, 20, now)).toEqual(
    expect.objectContaining({ width: 90, nameWidth: 6, barWidth: 38, hiddenCount: 0 }),
  )
  expect(bandLayout(usage, 100, 20, now)).toEqual(expect.objectContaining({ width: 92, barWidth: 40 }))
  expect(bandLayout(usage, 240, 20, now)).toEqual(expect.objectContaining({ width: 92, barWidth: 40 }))
  expect(bandLayout(usage, 50, 20, now).barWidth).toBe(6)
})

test('shows as many skills as the rows allow and counts the rest', () => {
  let usage = emptyUsage(now)
  for (const name of ['a', 'b', 'c', 'd', 'e']) usage = withInvocation(usage, name, 'claude', now)

  const layout = bandLayout(usage, 100, 10, now)

  expect(layout.rows.map(row => [row.rank, row.name])).toEqual([
    [1, 'a'],
    [2, 'b'],
    [3, 'c'],
  ])
  expect(layout.hiddenCount).toBe(2)
})
