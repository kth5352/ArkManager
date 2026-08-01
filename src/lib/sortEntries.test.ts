import { describe, it, expect } from 'vitest'
import { sortEntries } from './sortEntries'

interface Sortable {
  name: string
  mtimeMs: number
}

const items: Sortable[] = [
  { name: 'banana', mtimeMs: 200 },
  { name: 'apple', mtimeMs: 300 },
  { name: 'cherry', mtimeMs: 100 },
]

describe('sortEntries', () => {
  it('sorts by name ascending', () => {
    expect(sortEntries(items, 'name', 'asc').map((i) => i.name)).toEqual([
      'apple',
      'banana',
      'cherry',
    ])
  })

  it('sorts by name descending', () => {
    expect(sortEntries(items, 'name', 'desc').map((i) => i.name)).toEqual([
      'cherry',
      'banana',
      'apple',
    ])
  })

  it('sorts by mtime ascending', () => {
    expect(sortEntries(items, 'mtime', 'asc').map((i) => i.name)).toEqual([
      'cherry',
      'banana',
      'apple',
    ])
  })

  it('sorts by mtime descending', () => {
    expect(sortEntries(items, 'mtime', 'desc').map((i) => i.name)).toEqual([
      'apple',
      'banana',
      'cherry',
    ])
  })

  it('does not mutate the input array', () => {
    const copy = [...items]
    sortEntries(items, 'name', 'asc')
    expect(items).toEqual(copy)
  })

  describe('extension sort', () => {
    const mixed: Sortable[] = [
      { name: 'b-folder', mtimeMs: 0 },
      { name: 'zeta.rar', mtimeMs: 0 },
      { name: 'a-folder', mtimeMs: 0 },
      { name: 'alpha.zip', mtimeMs: 0 },
      { name: 'gamma.zip', mtimeMs: 0 },
      { name: 'beta.rar', mtimeMs: 0 },
    ]

    it('groups by extension, folders (no extension) first ascending', () => {
      expect(sortEntries(mixed, 'extension', 'asc').map((i) => i.name)).toEqual([
        'a-folder',
        'b-folder',
        'beta.rar',
        'zeta.rar',
        'alpha.zip',
        'gamma.zip',
      ])
    })

    it('orders entries within the same extension by name', () => {
      const sameExtension: Sortable[] = [
        { name: 'zeta.zip', mtimeMs: 0 },
        { name: 'alpha.zip', mtimeMs: 0 },
        { name: 'mango.zip', mtimeMs: 0 },
      ]
      expect(sortEntries(sameExtension, 'extension', 'asc').map((i) => i.name)).toEqual([
        'alpha.zip',
        'mango.zip',
        'zeta.zip',
      ])
    })

    it('reverses both the extension grouping and the within-group name order together', () => {
      expect(sortEntries(mixed, 'extension', 'desc').map((i) => i.name)).toEqual([
        'gamma.zip',
        'alpha.zip',
        'zeta.rar',
        'beta.rar',
        'b-folder',
        'a-folder',
      ])
    })
  })
})
