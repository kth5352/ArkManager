import { describe, it, expect } from 'vitest'
import { filterEntries } from './filterEntries'

interface TestEntry {
  name: string
  kind: 'folder' | 'file'
  code: { type: 'RJ' | 'VJ' | 'ST'; value: string } | null
}

const metadataByCode = {
  RJ01111111: { title: 'Alpha Game', circle: 'Circle One', genres: ['액션', '판타지'] },
  RJ02222222: { title: 'Beta Game', circle: 'Circle Two', genres: ['드라마'] },
}

const entries: TestEntry[] = [
  { name: 'alpha.zip', kind: 'file', code: { type: 'RJ', value: 'RJ01111111' } },
  { name: 'beta.zip', kind: 'file', code: { type: 'RJ', value: 'RJ02222222' } },
  { name: 'no-code-file.txt', kind: 'file', code: null },
]

describe('filterEntries', () => {
  it('matches by file name (case-insensitive)', () => {
    expect(filterEntries(entries, metadataByCode, 'ALPHA', [], []).map((e) => e.name)).toEqual([
      'alpha.zip',
    ])
  })

  it('matches by crawled title', () => {
    expect(filterEntries(entries, metadataByCode, 'Beta Game', [], []).map((e) => e.name)).toEqual([
      'beta.zip',
    ])
  })

  it('matches by circle name', () => {
    expect(filterEntries(entries, metadataByCode, 'Circle One', [], []).map((e) => e.name)).toEqual(
      ['alpha.zip']
    )
  })

  it('matches by game code', () => {
    expect(filterEntries(entries, metadataByCode, 'RJ02222222', [], []).map((e) => e.name)).toEqual(
      ['beta.zip']
    )
  })

  it('returns everything when query is empty and no genre filters are set', () => {
    expect(filterEntries(entries, metadataByCode, '', [], []).map((e) => e.name)).toEqual([
      'alpha.zip',
      'beta.zip',
      'no-code-file.txt',
    ])
  })

  it('excludes entries whose genres intersect the excluded-genre list', () => {
    expect(filterEntries(entries, metadataByCode, '', [], ['액션']).map((e) => e.name)).toEqual([
      'beta.zip',
      'no-code-file.txt',
    ])
  })

  it('never excludes code-less or metadata-less entries by genre (nothing to exclude on)', () => {
    expect(filterEntries(entries, metadataByCode, '', [], ['드라마']).map((e) => e.name)).toEqual([
      'alpha.zip',
      'no-code-file.txt',
    ])
  })

  it('includes only entries that have every included genre', () => {
    expect(filterEntries(entries, metadataByCode, '', ['액션'], []).map((e) => e.name)).toEqual([
      'alpha.zip',
    ])
  })

  it('requires ALL included genres to be present (AND, not OR)', () => {
    expect(
      filterEntries(entries, metadataByCode, '', ['액션', '드라마'], []).map((e) => e.name)
    ).toEqual([])
  })

  it('hides code-less or metadata-less entries when an include filter is set (unknown genres never match)', () => {
    expect(
      filterEntries(entries, metadataByCode, '', ['액션'], []).map((e) => e.name)
    ).not.toContain('no-code-file.txt')
  })

  it('applies included and excluded genre filters together', () => {
    expect(
      filterEntries(entries, metadataByCode, '', ['액션'], ['판타지']).map((e) => e.name)
    ).toEqual([])
  })

  describe('fileKindFilter', () => {
    const mixedEntries: TestEntry[] = [
      { name: 'archive.zip', kind: 'file', code: null },
      { name: 'extracted-folder', kind: 'folder', code: null },
      { name: 'loose-file.exe', kind: 'file', code: null },
    ]

    it('defaults to showing everything', () => {
      expect(filterEntries(mixedEntries, metadataByCode, '', [], []).map((e) => e.name)).toEqual([
        'archive.zip',
        'extracted-folder',
        'loose-file.exe',
      ])
    })

    it('archive-only shows only archive-extension files, not folders or other files', () => {
      expect(
        filterEntries(mixedEntries, metadataByCode, '', [], [], 'archive-only').map((e) => e.name)
      ).toEqual(['archive.zip'])
    })

    it('no-archive hides archive files but keeps folders and other files', () => {
      expect(
        filterEntries(mixedEntries, metadataByCode, '', [], [], 'no-archive').map((e) => e.name)
      ).toEqual(['extracted-folder', 'loose-file.exe'])
    })
  })
})
