import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { getGameUserData, touchGameUserData, rekeyToCode } from './gameUserDataRepository'

describe('gameUserDataRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns undefined when no user data exists for a key', () => {
    expect(getGameUserData(db, 'RJ01234567')).toBeUndefined()
  })

  it('creates a code-keyed row', () => {
    touchGameUserData(db, 'RJ01234567', 'code')
    const row = getGameUserData(db, 'RJ01234567')
    expect(row?.key).toBe('RJ01234567')
    expect(row?.keyType).toBe('code')
  })

  it('creates a path-keyed row for a code-less file', () => {
    touchGameUserData(db, 'd:\\games\\some-folder', 'path')
    const row = getGameUserData(db, 'd:\\games\\some-folder')
    expect(row?.keyType).toBe('path')
  })

  it('rekeys a path-keyed row to a code, preserving createdAt', () => {
    touchGameUserData(db, 'd:\\games\\some-folder', 'path')
    const before = getGameUserData(db, 'd:\\games\\some-folder')

    rekeyToCode(db, 'd:\\games\\some-folder', 'RJ09999999')

    expect(getGameUserData(db, 'd:\\games\\some-folder')).toBeUndefined()
    const after = getGameUserData(db, 'RJ09999999')
    expect(after?.keyType).toBe('code')
    expect(after?.createdAt).toBe(before?.createdAt)
  })

  it('rekeying is a no-op if the old path key does not exist', () => {
    expect(() => rekeyToCode(db, 'd:\\nope', 'RJ00000000')).not.toThrow()
    expect(getGameUserData(db, 'RJ00000000')).toBeUndefined()
  })
})
