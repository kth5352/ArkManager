import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { excludeEntry, restoreEntry, listExcludedEntries } from './excludedEntriesRepository'

describe('excludedEntriesRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('listExcludedEntries returns an empty array when nothing is excluded', () => {
    expect(listExcludedEntries(db)).toEqual([])
  })

  it('excludeEntry stores a path-keyed entry', () => {
    excludeEntry(db, 'd:\\games\\some-folder', 'some-folder')
    const rows = listExcludedEntries(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].path).toBe('d:\\games\\some-folder')
    expect(rows[0].name).toBe('some-folder')
    expect(rows[0].excludedAt).toEqual(expect.any(String))
  })

  it('excludeEntry overwrites an existing entry for the same path', () => {
    excludeEntry(db, 'd:\\games\\some-folder', 'Old Name')
    excludeEntry(db, 'd:\\games\\some-folder', 'New Name')
    const rows = listExcludedEntries(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('New Name')
  })

  it('excludeEntry stores two duplicate-code entries independently, keyed by their own paths', () => {
    excludeEntry(db, 'd:\\games\\copy-a', 'RJ01234567 (copy A)')
    excludeEntry(db, 'd:\\games\\copy-b', 'RJ01234567 (copy B)')
    const rows = listExcludedEntries(db)
    expect(rows).toHaveLength(2)
  })

  it('restoreEntry removes an existing entry', () => {
    excludeEntry(db, 'd:\\games\\some-folder', 'Some Game')
    restoreEntry(db, 'd:\\games\\some-folder')
    expect(listExcludedEntries(db)).toEqual([])
  })

  it('restoreEntry is a no-op when the path does not exist', () => {
    expect(() => restoreEntry(db, 'd:\\games\\never-excluded')).not.toThrow()
    expect(listExcludedEntries(db)).toEqual([])
  })

  it('restoreEntry does not affect a different path', () => {
    excludeEntry(db, 'd:\\games\\keep-me', 'Keep Me')
    excludeEntry(db, 'd:\\games\\remove-me', 'Remove Me')
    restoreEntry(db, 'd:\\games\\remove-me')
    const rows = listExcludedEntries(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].path).toBe('d:\\games\\keep-me')
  })
})
