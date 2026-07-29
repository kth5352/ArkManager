import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import {
  getGameUserData,
  touchGameUserData,
  rekeyToCode,
  setFavorite,
  setRatingAndMemo,
  listFavoriteKeys,
  setLaunchConfig,
  recordPlaySession,
  setSavePath,
  listRecentlyPlayedKeys,
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

  it('lists only the keys currently marked as favorite', () => {
    setFavorite(db, 'RJ01111111', 'code', true)
    setFavorite(db, 'RJ02222222', 'code', false)
    setFavorite(db, 'd:\\games\\folder', 'path', true)

    expect(listFavoriteKeys(db).sort()).toEqual(['RJ01111111', 'd:\\games\\folder'].sort())
  })

  it('stores and retrieves a launch config', () => {
    setLaunchConfig(db, 'RJ01234567', 'code', {
      executablePath: 'C:\\games\\RJ01234567\\game.exe',
      launchMode: 'normal',
    })

    const row = getGameUserData(db, 'RJ01234567')
    expect(row?.launchConfig).toEqual({
      executablePath: 'C:\\games\\RJ01234567\\game.exe',
      launchMode: 'normal',
    })
  })

  it('defaults totalPlaytimeMs to 0 and lastPlayedAt to null', () => {
    touchGameUserData(db, 'RJ01234567', 'code')
    const row = getGameUserData(db, 'RJ01234567')
    expect(row?.totalPlaytimeMs).toBe(0)
    expect(row?.lastPlayedAt).toBeNull()
  })

  it('accumulates playtime across multiple sessions and updates lastPlayedAt', () => {
    recordPlaySession(db, 'RJ01234567', 'code', 60_000)
    recordPlaySession(db, 'RJ01234567', 'code', 30_000)

    const row = getGameUserData(db, 'RJ01234567')
    expect(row?.totalPlaytimeMs).toBe(90_000)
    expect(row?.lastPlayedAt).not.toBeNull()
  })

  it('stores a save path independently of other fields', () => {
    setSavePath(db, 'RJ01234567', 'code', 'C:\\Users\\me\\AppData\\LocalLow\\game\\save')
    expect(getGameUserData(db, 'RJ01234567')?.savePath).toBe(
      'C:\\Users\\me\\AppData\\LocalLow\\game\\save'
    )
  })

  it('rekeying preserves launchConfig/playtime/savePath too', () => {
    setLaunchConfig(db, 'd:\\games\\some-folder', 'path', {
      executablePath: 'd:\\games\\some-folder\\game.exe',
      launchMode: 'normal',
    })
    recordPlaySession(db, 'd:\\games\\some-folder', 'path', 120_000)
    setSavePath(db, 'd:\\games\\some-folder', 'path', 'd:\\saves\\some-folder')

    rekeyToCode(db, 'd:\\games\\some-folder', 'RJ07777777')

    const after = getGameUserData(db, 'RJ07777777')
    expect(after?.launchConfig?.executablePath).toBe('d:\\games\\some-folder\\game.exe')
    expect(after?.totalPlaytimeMs).toBe(120_000)
    expect(after?.savePath).toBe('d:\\saves\\some-folder')
  })

  it('rekeying onto an existing code-keyed row merges without losing either side\'s data', () => {
    // The code already has its own accumulated data (e.g. crawled/favorited independently).
    setFavorite(db, 'RJ07777777', 'code', true)
    setRatingAndMemo(db, 'RJ07777777', 'code', 4, 'code-side memo')

    // The path also has its own accumulated data (playtime, save path) - nothing
    // the code row has yet.
    recordPlaySession(db, 'd:\\games\\some-folder', 'path', 90_000)
    setSavePath(db, 'd:\\games\\some-folder', 'path', 'd:\\saves\\some-folder')

    rekeyToCode(db, 'd:\\games\\some-folder', 'RJ07777777')

    const merged = getGameUserData(db, 'RJ07777777')
    // Code row's non-default values win.
    expect(merged?.isFavorite).toBe(true)
    expect(merged?.rating).toBe(4)
    expect(merged?.memo).toBe('code-side memo')
    // Path row backfills fields the code row left at default.
    expect(merged?.totalPlaytimeMs).toBe(90_000)
    expect(merged?.savePath).toBe('d:\\saves\\some-folder')
    // The old path-keyed row is gone.
    expect(getGameUserData(db, 'd:\\games\\some-folder')).toBeUndefined()
  })

  it('rekeying onto an existing code-keyed row backfills isFavorite from the path row when the code row was never favorited', () => {
    touchGameUserData(db, 'RJ08888888', 'code') // exists, but isFavorite defaults to false
    setFavorite(db, 'd:\\games\\another-folder', 'path', true)

    rekeyToCode(db, 'd:\\games\\another-folder', 'RJ08888888')

    expect(getGameUserData(db, 'RJ08888888')?.isFavorite).toBe(true)
  })

  it('lists keys with a recorded play session, most recent first', () => {
    recordPlaySession(db, 'RJ01111111', 'code', 1000)
    recordPlaySession(db, 'RJ02222222', 'code', 1000)
    touchGameUserData(db, 'RJ03333333', 'code') // 플레이 기록 없음 - 제외돼야 함

    const recent = listRecentlyPlayedKeys(db)
    expect(recent.map((r) => r.key)).toEqual(['RJ02222222', 'RJ01111111'])
  })
})
