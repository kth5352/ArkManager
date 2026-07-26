import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { getSetting, setSetting } from './settingsRepository'

describe('settingsRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns undefined for a key that was never set', () => {
    expect(getSetting(db, 'theme')).toBeUndefined()
  })

  it('stores and retrieves a value', () => {
    setSetting(db, 'theme', 'dark')
    expect(getSetting(db, 'theme')).toBe('dark')
  })

  it('overwrites an existing value on conflict', () => {
    setSetting(db, 'theme', 'dark')
    setSetting(db, 'theme', 'light')
    expect(getSetting(db, 'theme')).toBe('light')
  })
})
