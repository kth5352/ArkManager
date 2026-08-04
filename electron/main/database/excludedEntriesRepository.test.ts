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

  it('excludeEntry stores a code-keyed entry', () => {
    excludeEntry(db, 'RJ01234567', 'code', 'Some Game')
    const rows = listExcludedEntries(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('RJ01234567')
    expect(rows[0].keyType).toBe('code')
    expect(rows[0].name).toBe('Some Game')
    expect(rows[0].excludedAt).toEqual(expect.any(String))
  })

  it('excludeEntry stores a path-keyed entry', () => {
    excludeEntry(db, 'd:\\games\\some-folder', 'path', 'some-folder')
    const rows = listExcludedEntries(db)
    expect(rows[0].key).toBe('d:\\games\\some-folder')
    expect(rows[0].keyType).toBe('path')
  })

  it('excludeEntry overwrites an existing entry for the same key', () => {
    excludeEntry(db, 'RJ01234567', 'code', 'Old Name')
    excludeEntry(db, 'RJ01234567', 'code', 'New Name')
    const rows = listExcludedEntries(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('New Name')
  })

  it('restoreEntry removes an existing entry', () => {
    excludeEntry(db, 'RJ01234567', 'code', 'Some Game')
    restoreEntry(db, 'RJ01234567')
    expect(listExcludedEntries(db)).toEqual([])
  })

  it('restoreEntry is a no-op when the key does not exist', () => {
    expect(() => restoreEntry(db, 'RJ99999999')).not.toThrow()
    expect(listExcludedEntries(db)).toEqual([])
  })

  it('restoreEntry does not affect a different key', () => {
    excludeEntry(db, 'RJ01234567', 'code', 'Keep Me')
    excludeEntry(db, 'RJ09999999', 'code', 'Remove Me')
    restoreEntry(db, 'RJ09999999')
    const rows = listExcludedEntries(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('RJ01234567')
  })
})
