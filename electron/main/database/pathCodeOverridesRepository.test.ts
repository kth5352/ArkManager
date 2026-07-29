import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { setPathCodeOverride, getPathCodeOverride } from './pathCodeOverridesRepository'
import { rekeyToCode, getGameUserData, setFavorite } from './gameUserDataRepository'

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

  it('composes with rekeyToCode exactly as the link-code IPC handler does: override written, existing path-keyed data migrated', () => {
    setFavorite(db, 'd:\\games\\some-folder', 'path', true)

    setPathCodeOverride(db, 'd:\\games\\some-folder', 'RJ01234567')
    rekeyToCode(db, 'd:\\games\\some-folder', 'RJ01234567')

    expect(getPathCodeOverride(db, 'd:\\games\\some-folder')).toBe('RJ01234567')
    expect(getGameUserData(db, 'RJ01234567')?.isFavorite).toBe(true)
    expect(getGameUserData(db, 'd:\\games\\some-folder')).toBeUndefined()
  })
})
