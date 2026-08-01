import { describe, it, expect } from 'vitest'
import { groupDuplicatesByCode } from './groupDuplicatesByCode'

interface TestEntry {
  name: string
  code: { value: string } | null
}

describe('groupDuplicatesByCode', () => {
  it('groups entries sharing the same code', () => {
    const entries: TestEntry[] = [
      { name: 'a.zip', code: { value: 'RJ01111111' } },
      { name: 'a-extracted', code: { value: 'RJ01111111' } },
      { name: 'b.zip', code: { value: 'RJ02222222' } },
    ]
    const groups = groupDuplicatesByCode(entries)
    expect(groups.get('RJ01111111')?.map((e) => e.name)).toEqual(['a.zip', 'a-extracted'])
  })

  it('excludes codes with only one entry', () => {
    const entries: TestEntry[] = [
      { name: 'a.zip', code: { value: 'RJ01111111' } },
      { name: 'b.zip', code: { value: 'RJ02222222' } },
    ]
    expect(groupDuplicatesByCode(entries).size).toBe(0)
  })

  it('ignores code-less entries entirely', () => {
    const entries: TestEntry[] = [
      { name: 'a.txt', code: null },
      { name: 'b.txt', code: null },
    ]
    expect(groupDuplicatesByCode(entries).size).toBe(0)
  })

  it('handles three or more copies of the same code', () => {
    const entries: TestEntry[] = [
      { name: 'v1.zip', code: { value: 'RJ01111111' } },
      { name: 'v2.zip', code: { value: 'RJ01111111' } },
      { name: 'v3.zip', code: { value: 'RJ01111111' } },
    ]
    expect(groupDuplicatesByCode(entries).get('RJ01111111')).toHaveLength(3)
  })

  it('returns an empty map for an empty list', () => {
    expect(groupDuplicatesByCode([]).size).toBe(0)
  })
})
