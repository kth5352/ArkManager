import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import {
  getGameUserData,
  recordPlaySession,
  setCleared,
  setCustomCoverPath,
  setFavorite,
  setLaunchConfig,
  setRatingAndMemo,
  setSavePath,
} from './gameUserDataRepository'
import { getPathCodeOverride, setPathCodeOverride } from './pathCodeOverridesRepository'
import { excludeEntry, listExcludedEntries } from './excludedEntriesRepository'
import {
  createMediaPlaylist,
  getMediaPlaylistTracks,
  setMediaPlaylistTracks,
} from './mediaPlaylistsRepository'
import { listLikedTracks, toggleTrackLike } from './mediaTrackLikesRepository'
import {
  getMediaThumbnailOverride,
  setMediaThumbnailOverride,
} from './mediaThumbnailOverridesRepository'
import { normalizeLibraryPath } from '../../../shared/normalizeLibraryPath'
import { remapUnderPrefix, rekeyMovedPath } from './rekeyMovedPath'

const OLD = 'D:\\Games\\Circle'
const NEW = 'E:\\Archive\\Circle (done)'

describe('remapUnderPrefix', () => {
  it('maps the path itself and anything below it, ignoring case and separator style', () => {
    expect(remapUnderPrefix('d:\\games\\circle', OLD, NEW)).toBe(NEW)
    expect(remapUnderPrefix('D:/Games/Circle/Game A/game.exe', OLD, NEW)).toBe(
      'E:\\Archive\\Circle (done)/Game A/game.exe'
    )
  })

  it('does not match a sibling that merely shares the prefix string', () => {
    expect(remapUnderPrefix('D:\\Games\\Circle2\\x', OLD, NEW)).toBeNull()
    expect(remapUnderPrefix('D:\\Other', OLD, NEW)).toBeNull()
  })
})

// rekeyPath used to move only the row whose key was EXACTLY the moved path.
// Moving or renaming a folder therefore orphaned everything recorded for
// entries inside it, and absolute paths stored inside rows (a coded game's
// launch executable, its save folder) were never rewritten - so a moved
// game's launch config silently pointed at the old location.
describe('rekeyMovedPath', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  afterEach(() => {
    db.$client.close()
  })

  it('moves path-keyed user data and code overrides for the folder and its children', () => {
    const child = normalizeLibraryPath(`${OLD}\\Untitled Game`)
    setFavorite(db, normalizeLibraryPath(OLD), 'path', true)
    setFavorite(db, child, 'path', true)
    setPathCodeOverride(db, normalizeLibraryPath(`${OLD}\\Linked`), 'RJ01234567')

    rekeyMovedPath(db, OLD, NEW)

    expect(getGameUserData(db, normalizeLibraryPath(NEW))?.isFavorite).toBe(true)
    expect(getGameUserData(db, normalizeLibraryPath(`${NEW}\\Untitled Game`))?.isFavorite).toBe(
      true
    )
    expect(getGameUserData(db, child)).toBeUndefined()
    expect(getPathCodeOverride(db, normalizeLibraryPath(`${NEW}\\Linked`))).toBe('RJ01234567')
    expect(getPathCodeOverride(db, normalizeLibraryPath(`${OLD}\\Linked`))).toBeNull()
  })

  it('rewrites launch executable and save paths stored inside code-keyed rows', () => {
    setLaunchConfig(db, 'RJ01234567', 'code', {
      executablePath: `${OLD}\\RJ01234567\\Game.exe`,
      launchMode: 'locale-emulator',
    })
    setSavePath(db, 'RJ01234567', 'code', `${OLD}\\RJ01234567\\save`)
    setSavePath(db, 'RJ07654321', 'code', 'C:\\Users\\me\\AppData\\Roaming\\Game')

    rekeyMovedPath(db, OLD, NEW)

    const row = getGameUserData(db, 'RJ01234567')
    expect(row?.launchConfig).toEqual({
      executablePath: `${NEW}\\RJ01234567\\Game.exe`,
      launchMode: 'locale-emulator',
    })
    expect(row?.savePath).toBe(`${NEW}\\RJ01234567\\save`)
    expect(getGameUserData(db, 'RJ07654321')?.savePath).toBe(
      'C:\\Users\\me\\AppData\\Roaming\\Game'
    )
  })

  it('moves exclusions, playlist tracks, likes and media thumbnail overrides', () => {
    const track = `${OLD}\\RJ01234567 ASMR\\01.mp3`
    const movedTrack = `${NEW}\\RJ01234567 ASMR\\01.mp3`
    excludeEntry(db, normalizeLibraryPath(`${OLD}\\Hidden`), 'Hidden')
    createMediaPlaylist(db, 'p1', 'List')
    setMediaPlaylistTracks(db, 'p1', [
      { path: track, name: '01.mp3' },
      { path: 'F:\\Music\\other.mp3', name: 'other.mp3' },
    ])
    toggleTrackLike(db, track, '01.mp3')
    setMediaThumbnailOverride(db, track, 'C:\\cache\\thumb.webp')

    rekeyMovedPath(db, OLD, NEW)

    expect(listExcludedEntries(db).map((e) => e.path)).toEqual([
      normalizeLibraryPath(`${NEW}\\Hidden`),
    ])
    expect(getMediaPlaylistTracks(db, 'p1').map((t) => t.path)).toEqual([
      movedTrack,
      'F:\\Music\\other.mp3',
    ])
    expect(listLikedTracks(db).map((t) => t.path)).toEqual([movedTrack])
    expect(getMediaThumbnailOverride(db, movedTrack)).toBe('C:\\cache\\thumb.webp')
    expect(getMediaThumbnailOverride(db, track)).toBeNull()
  })

  it('preserves every field of a moved path-keyed row', () => {
    const oldKey = 'd:\\games\\old-folder'
    setFavorite(db, oldKey, 'path', true)
    setCleared(db, oldKey, 'path', true)
    setRatingAndMemo(db, oldKey, 'path', 5, '메모')
    recordPlaySession(db, oldKey, 'path', 60_000)
    setCustomCoverPath(db, oldKey, 'path', 'C:\\covers\\a.webp')

    rekeyMovedPath(db, 'D:\\Games\\old-folder', 'D:\\Archive\\old-folder')

    expect(getGameUserData(db, oldKey)).toBeUndefined()
    const after = getGameUserData(db, 'd:\\archive\\old-folder')
    expect(after?.keyType).toBe('path')
    expect(after?.isFavorite).toBe(true)
    expect(after?.isCleared).toBe(true)
    expect(after?.rating).toBe(5)
    expect(after?.memo).toBe('메모')
    expect(after?.totalPlaytimeMs).toBe(60_000)
    expect(after?.lastPlayedAt).not.toBeNull()
    expect(after?.customCoverPath).toBe('C:\\covers\\a.webp')
  })

  it('is a no-op when nothing was recorded under the old path', () => {
    expect(() => rekeyMovedPath(db, 'D:\\nope', 'D:\\elsewhere')).not.toThrow()
    expect(getGameUserData(db, 'd:\\elsewhere')).toBeUndefined()
  })

  it('never re-keys a code-keyed row', () => {
    setFavorite(db, 'RJ01234567', 'code', true)
    rekeyMovedPath(db, 'RJ01234567', 'D:\\somewhere')
    expect(getGameUserData(db, 'RJ01234567')?.isFavorite).toBe(true)
    expect(getGameUserData(db, 'd:\\somewhere')).toBeUndefined()
  })

  it('is a no-op when old and new paths are the same', () => {
    setFavorite(db, normalizeLibraryPath(OLD), 'path', true)
    rekeyMovedPath(db, OLD, OLD.toUpperCase())
    expect(getGameUserData(db, normalizeLibraryPath(OLD))?.isFavorite).toBe(true)
  })
})
