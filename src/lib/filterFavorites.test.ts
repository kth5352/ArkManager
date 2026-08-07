import { describe, it, expect } from 'vitest'
import { filterFavorites } from './filterFavorites'
import type { ScannedEntry } from '../../shared/types/scanner'

function entry(overrides: Partial<ScannedEntry>): Pick<ScannedEntry, 'code' | 'path' | 'kind' | 'mtimeMs' | 'name'> {
  return {
    name: 'Unnamed',
    code: null,
    path: 'D:\\Games\\Unnamed',
    kind: 'folder',
    mtimeMs: 0,
    ...overrides,
  }
}

describe('filterFavorites', () => {
  it('includes a code-less game whose scanned path has mixed/upper case when the favorite key is stored normalized (lowercase, no trailing slash)', () => {
    const games = [entry({ path: 'D:\\Games\\MyFolder' })]
    const favoriteKeys = ['d:\\games\\myfolder']

    expect(filterFavorites(games, favoriteKeys)).toEqual(games)
  })

  it('excludes a code-less game that is not in the favorite keys', () => {
    const games = [entry({ path: 'D:\\Games\\MyFolder' })]
    const favoriteKeys = ['d:\\games\\someotherfolder']

    expect(filterFavorites(games, favoriteKeys)).toEqual([])
  })

  it('matches a coded game on its code value, unaffected by path normalization', () => {
    const games = [
      entry({ path: 'D:\\Games\\RJ01234567', code: { type: 'RJ', value: 'RJ01234567' } }),
    ]
    const favoriteKeys = ['RJ01234567']

    expect(filterFavorites(games, favoriteKeys)).toEqual(games)
  })

  it('excludes a coded game whose code is not favorited even if a similarly-cased path key exists', () => {
    const games = [
      entry({ path: 'D:\\Games\\RJ01234567', code: { type: 'RJ', value: 'RJ01234567' } }),
    ]
    const favoriteKeys = ['d:\\games\\rj01234567']

    expect(filterFavorites(games, favoriteKeys)).toEqual([])
  })

  it('collapses coded favorite duplicates to one representative', () => {
    const folder = entry({
      name: 'Folder',
      path: 'D:\\Games\\RJ01234567',
      kind: 'folder',
      mtimeMs: 10,
      code: { type: 'RJ', value: 'RJ01234567' },
    })
    const archive = entry({
      name: 'Archive.zip',
      path: 'D:\\Games\\RJ01234567.zip',
      kind: 'file',
      mtimeMs: 20,
      code: { type: 'RJ', value: 'RJ01234567' },
    })

    expect(filterFavorites([archive, folder], ['RJ01234567'])).toEqual([folder])
  })

  it('keeps code-less favorites path-specific', () => {
    const a = entry({ path: 'D:\\Games\\A', code: null, kind: 'folder', mtimeMs: 1 })
    const b = entry({ path: 'D:\\Games\\B', code: null, kind: 'folder', mtimeMs: 2 })

    expect(filterFavorites([a, b], ['d:\\games\\a', 'd:\\games\\b'])).toEqual([a, b])
  })
})
