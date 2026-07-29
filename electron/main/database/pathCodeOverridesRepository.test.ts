import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { setPathCodeOverride, getPathCodeOverride } from './pathCodeOverridesRepository'

describe('pathCodeOverridesRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns null when no override exists for a path', () => {
    expect(getPathCodeOverride(db, 'd:\\games\\some-folder')).toBeNull()
  })

  it('stores and retrieves an override', () => {
    setPathCodeOverride(db, 'd:\\games\\some-folder', 'RJ01234567')
    expect(getPathCodeOverride(db, 'd:\\games\\some-folder')).toBe('RJ01234567')
  })

  it('overwrites an existing override for the same path', () => {
    setPathCodeOverride(db, 'd:\\games\\some-folder', 'RJ01234567')
    setPathCodeOverride(db, 'd:\\games\\some-folder', 'RJ09999999')
    expect(getPathCodeOverride(db, 'd:\\games\\some-folder')).toBe('RJ09999999')
  })
})
