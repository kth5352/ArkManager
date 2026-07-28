import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { getSortPreference, setSortPreference } from './sortPreferencesRepository'

describe('sortPreferencesRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns undefined when no preference was ever set for a page', () => {
    expect(getSortPreference(db, 'gallery')).toBeUndefined()
  })

  it('stores and retrieves a preference', () => {
    setSortPreference(db, 'gallery', 'mtime', 'desc')
    expect(getSortPreference(db, 'gallery')).toEqual({ field: 'mtime', direction: 'desc' })
  })

  it('overwrites an existing preference for the same page', () => {
    setSortPreference(db, 'gallery', 'mtime', 'desc')
    setSortPreference(db, 'gallery', 'name', 'asc')
    expect(getSortPreference(db, 'gallery')).toEqual({ field: 'name', direction: 'asc' })
  })

  it('keeps preferences for different pages independent', () => {
    setSortPreference(db, 'gallery', 'mtime', 'desc')
    setSortPreference(db, 'list', 'name', 'asc')
    expect(getSortPreference(db, 'gallery')).toEqual({ field: 'mtime', direction: 'desc' })
    expect(getSortPreference(db, 'list')).toEqual({ field: 'name', direction: 'asc' })
  })
})
