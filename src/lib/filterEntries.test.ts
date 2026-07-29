import { describe, it, expect } from 'vitest'
import { filterEntries } from './filterEntries'

interface TestEntry {
  name: string
  code: { type: 'RJ' | 'VJ' | 'ST'; value: string } | null
}

const metadataByCode = {
  RJ01111111: { title: 'Alpha Game', circle: 'Circle One', genres: ['액션', '판타지'] },
  RJ02222222: { title: 'Beta Game', circle: 'Circle Two', genres: ['드라마'] },
}

const entries: TestEntry[] = [
  { name: 'alpha.zip', code: { type: 'RJ', value: 'RJ01111111' } },
  { name: 'beta.zip', code: { type: 'RJ', value: 'RJ02222222' } },
  { name: 'no-code-file.txt', code: null },
]

describe('filterEntries', () => {
  it('matches by file name (case-insensitive)', () => {
    expect(filterEntries(entries, metadataByCode, 'ALPHA', []).map((e) => e.name)).toEqual([
      'alpha.zip',
    ])
  })

  it('matches by crawled title', () => {
    expect(filterEntries(entries, metadataByCode, 'Beta Game', []).map((e) => e.name)).toEqual([
      'beta.zip',
    ])
  })

  it('matches by circle name', () => {
    expect(filterEntries(entries, metadataByCode, 'Circle One', []).map((e) => e.name)).toEqual([
      'alpha.zip',
    ])
  })

  it('matches by game code', () => {
    expect(filterEntries(entries, metadataByCode, 'RJ02222222', []).map((e) => e.name)).toEqual([
      'beta.zip',
    ])
  })

  it('returns everything when query is empty and no genres excluded', () => {
    expect(filterEntries(entries, metadataByCode, '', []).map((e) => e.name)).toEqual([
      'alpha.zip',
      'beta.zip',
      'no-code-file.txt',
    ])
  })

  it('excludes entries whose genres intersect the excluded-genre list', () => {
    expect(filterEntries(entries, metadataByCode, '', ['액션']).map((e) => e.name)).toEqual([
      'beta.zip',
      'no-code-file.txt',
    ])
  })

  it('never excludes code-less or metadata-less entries by genre (nothing to exclude on)', () => {
    expect(filterEntries(entries, metadataByCode, '', ['드라마']).map((e) => e.name)).toEqual([
      'alpha.zip',
      'no-code-file.txt',
    ])
  })
})
