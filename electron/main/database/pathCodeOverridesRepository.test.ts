import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import {
  setPathCodeOverride,
  getPathCodeOverride,
  listPathCodeOverrides,
} from './pathCodeOverridesRepository'
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

  it('listPathCodeOverrides returns an empty Map when no overrides exist', () => {
    const overrides = listPathCodeOverrides(db)
    expect(overrides).toBeInstanceOf(Map)
    expect(overrides.size).toBe(0)
  })

  it('listPathCodeOverrides returns a Map of every stored path -> code pair', () => {
    setPathCodeOverride(db, 'd:\\games\\some-folder', 'RJ01234567')
    setPathCodeOverride(db, 'd:\\games\\other-folder', 'VJ09999999')

    const overrides = listPathCodeOverrides(db)
    expect(overrides.size).toBe(2)
    expect(overrides.get('d:\\games\\some-folder')).toBe('RJ01234567')
    expect(overrides.get('d:\\games\\other-folder')).toBe('VJ09999999')
  })
})
