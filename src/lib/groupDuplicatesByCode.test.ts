import { describe, it, expect } from 'vitest'
import { groupDuplicatesByCode } from './groupDuplicatesByCode'

interface TestEntry {
  name: string
  kind: 'file' | 'folder'
  code: { value: string } | null
}

describe('groupDuplicatesByCode', () => {
  it('groups entries sharing the same code and same entry kind', () => {
    const entries: TestEntry[] = [
      { name: 'a.zip', kind: 'file', code: { value: 'RJ01111111' } },
      { name: 'a-v2.zip', kind: 'file', code: { value: 'RJ01111111' } },
      { name: 'a-extracted', kind: 'folder', code: { value: 'RJ01111111' } },
      { name: 'b.zip', kind: 'file', code: { value: 'RJ02222222' } },
    ]
    const groups = groupDuplicatesByCode(entries)
    expect(groups.get('RJ01111111:file:archive')?.map((e) => e.name)).toEqual([
      'a.zip',
      'a-v2.zip',
    ])
  })

  it('does not count an archive and its extracted folder as duplicates', () => {
    const entries: TestEntry[] = [
      { name: 'a.zip', kind: 'file', code: { value: 'RJ01111111' } },
      { name: 'a-extracted', kind: 'folder', code: { value: 'RJ01111111' } },
    ]

    expect(groupDuplicatesByCode(entries).size).toBe(0)
  })

  it('excludes codes with only one entry', () => {
    const entries: TestEntry[] = [
      { name: 'a.zip', kind: 'file', code: { value: 'RJ01111111' } },
      { name: 'b.zip', kind: 'file', code: { value: 'RJ02222222' } },
    ]
    expect(groupDuplicatesByCode(entries).size).toBe(0)
  })

  it('ignores code-less entries entirely', () => {
    const entries: TestEntry[] = [
      { name: 'a.txt', kind: 'file', code: null },
      { name: 'b.txt', kind: 'file', code: null },
    ]
    expect(groupDuplicatesByCode(entries).size).toBe(0)
  })

  it('handles three or more copies of the same code', () => {
    const entries: TestEntry[] = [
      { name: 'v1.zip', kind: 'file', code: { value: 'RJ01111111' } },
      { name: 'v2.zip', kind: 'file', code: { value: 'RJ01111111' } },
      { name: 'v3.zip', kind: 'file', code: { value: 'RJ01111111' } },
    ]
    expect(groupDuplicatesByCode(entries).get('RJ01111111:file:archive')).toHaveLength(3)
  })

  it('returns an empty map for an empty list', () => {
    expect(groupDuplicatesByCode([]).size).toBe(0)
  })
})
