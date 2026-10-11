import { expect, test } from 'claude-code/testing'

import { flatPlan, superpowersPlan } from './fixtures'
import { resolveItem } from './matching'
import type { Resolution } from './matching'
import { parseOutline } from './outline'

const outline = parseOutline(superpowersPlan)

function refOf(resolution: Resolution): string {
  if ('error' in resolution) return `error: ${resolution.error}`
  return resolution.target.kind === 'item' ? resolution.target.item.ref : `group ${resolution.target.group.ref}`
}

test('resolves refs, with or without a T prefix', () => {
  expect(refOf(resolveItem(outline, '2.2'))).toBe('2.2')
  expect(refOf(resolveItem(outline, 'T2.2'))).toBe('2.2')
  expect(refOf(resolveItem(outline, '3'))).toBe('group 3')
})

test('resolves "group / item" pairs', () => {
  expect(refOf(resolveItem(outline, 'Task 2 / Step 3'))).toBe('2.3')
  expect(refOf(resolveItem(outline, '2 / commit'))).toBe('2.3')
})

test('resolves unique text, preferring exact over partial matches', () => {
  expect(refOf(resolveItem(outline, 'Implement rollupStatus'))).toBe('2.2')
  expect(refOf(resolveItem(outline, 'Task 3: Forge detection'))).toBe('group 3')
  expect(refOf(resolveItem(parseOutline(flatPlan), 'T3'))).toBe('3')
})

test('refuses ambiguous text and lists the candidates', () => {
  const resolution = resolveItem(outline, 'Step 1')

  expect(refOf(resolution)).toMatch(/matches several items: 1.1 Step 1: Write the failing test; 2.1 Step 1/)
})

test('says when nothing matches', () => {
  expect(refOf(resolveItem(outline, 'deploy'))).toMatch(/No item matches "deploy"/)
})
