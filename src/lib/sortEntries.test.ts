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
})
