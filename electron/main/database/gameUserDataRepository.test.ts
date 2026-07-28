import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import {
  getGameUserData,
  touchGameUserData,
  rekeyToCode,
  setFavorite,
  setRatingAndMemo,
} from './gameUserDataRepository'

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

  it('defaults isFavorite to false and rating/memo to null on first touch', () => {
    touchGameUserData(db, 'RJ01234567', 'code')
    const row = getGameUserData(db, 'RJ01234567')
    expect(row?.isFavorite).toBe(false)
    expect(row?.rating).toBeNull()
    expect(row?.memo).toBeNull()
  })

  it('sets favorite independently of rating/memo', () => {
    touchGameUserData(db, 'RJ01234567', 'code')
    setFavorite(db, 'RJ01234567', 'code', true)

    const row = getGameUserData(db, 'RJ01234567')
    expect(row?.isFavorite).toBe(true)
    expect(row?.rating).toBeNull()
  })

  it('sets rating and memo together, and creates the row if it does not exist yet', () => {
    setRatingAndMemo(db, 'RJ01234567', 'code', 5, '최고의 게임')

    const row = getGameUserData(db, 'RJ01234567')
    expect(row?.rating).toBe(5)
    expect(row?.memo).toBe('최고의 게임')
    expect(row?.isFavorite).toBe(false)
  })

  it('setFavorite creates a path-keyed row if it does not exist yet', () => {
    setFavorite(db, 'd:\\games\\some-folder', 'path', true)
    expect(getGameUserData(db, 'd:\\games\\some-folder')?.isFavorite).toBe(true)
  })

  it('rekeying preserves isFavorite/rating/memo, not just createdAt', () => {
    setFavorite(db, 'd:\\games\\some-folder', 'path', true)
    setRatingAndMemo(db, 'd:\\games\\some-folder', 'path', 4, '괜찮음')

    rekeyToCode(db, 'd:\\games\\some-folder', 'RJ08888888')

    const after = getGameUserData(db, 'RJ08888888')
    expect(after?.isFavorite).toBe(true)
    expect(after?.rating).toBe(4)
    expect(after?.memo).toBe('괜찮음')
  })
})
