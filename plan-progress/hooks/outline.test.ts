import { describe, expect, test } from 'claude-code/testing'

import { flatPlan, superpowersPlan } from './fixtures'
import { counts, firstOpenItem, parseOutline, withTicked } from './outline'

describe('parseOutline', () => {
  test('groups checkboxes under their nearest heading and takes the first h1 as title', () => {
    const outline = parseOutline(superpowersPlan)

    expect(outline.title).toBe('GitHub support')
    expect(outline.groups.map(group => group.title)).toEqual([
      'Task 1: Forge interface',
      'Task 2: GitHub parsers',
      'Task 3: Forge detection',
    ])
    expect(outline.groups[1]?.items.map(item => item.ref)).toEqual(['2.1', '2.2', '2.3'])
  })

  test('strips markdown emphasis and code from item text', () => {
    const [first, second] = parseOutline(superpowersPlan).groups[0]?.items ?? []

    expect(first?.text).toBe('Step 1: Write the failing test')
    expect(second?.text).toBe('Step 2: Implement Forge')
  })

  test('ignores checkboxes inside code fences and keeps nesting depth', () => {
    const outline = parseOutline(superpowersPlan)

    expect(counts(outline)).toEqual({ done: 3, total: 7 })
    expect(outline.groups[2]?.items.map(item => item.depth)).toEqual([0, 1])
  })

  test('numbers a single group flat', () => {
    const outline = parseOutline(flatPlan)

    expect(outline.title).toBeNull()
    expect(outline.groups[0]?.items.map(item => item.ref)).toEqual(['1', '2', '3'])
    expect(firstOpenItem(outline)?.text).toBe('T2. Back office lists')
  })

  test('drops headings without checkboxes', () => {
    expect(parseOutline('# Plan\n\n## Context\n\ntext\n\n## Tasks\n\n- [ ] one\n').groups).toHaveLength(1)
  })
})

describe('withTicked', () => {
  test('ticks only the given lines and keeps the rest of the file', () => {
    const outline = parseOutline(flatPlan)
    const line = outline.groups[0]?.items[1]?.line ?? -1

    const ticked = withTicked(flatPlan, [line])

    expect(ticked).toBe(flatPlan.replace('- [ ] T2.', '- [x] T2.'))
  })

  test('keeps CRLF line endings', () => {
    const markdown = '- [ ] one\r\n- [ ] two\r\n'

    expect(withTicked(markdown, [1])).toBe('- [ ] one\r\n- [x] two\r\n')
  })
})
