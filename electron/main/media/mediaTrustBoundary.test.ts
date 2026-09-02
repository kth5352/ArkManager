import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDbClient, type AppDatabase } from '../database/client'
import { addLibrary } from '../database/librariesRepository'
import { setSetting } from '../database/settingsRepository'
import { createMediaPlaylist, setMediaPlaylistTracks } from '../database/mediaPlaylistsRepository'
import { toggleTrackLike } from '../database/mediaTrackLikesRepository'
import { computeMediaAllowedRoots, computeMediaTrustedPaths } from './mediaTrustBoundary'

describe('computeMediaAllowedRoots', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  afterEach(() => {
    db.$client.close()
  })

  it('returns just the registered libraries when no media-folder is set', () => {
    addLibrary(db, 'Music', 'D:\\Music')
    expect(computeMediaAllowedRoots(db)).toEqual(['d:\\music'])
  })

  it('appends the current media-folder to the registered libraries', () => {
    addLibrary(db, 'Music', 'D:\\Music')
    setSetting(db, 'media-folder', 'E:\\Podcasts')
    expect(computeMediaAllowedRoots(db)).toEqual(['d:\\music', 'E:\\Podcasts'])
  })
})

describe('computeMediaTrustedPaths', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  afterEach(() => {
    db.$client.close()
  })

  it('returns an empty array when there are no playlists or likes', () => {
    expect(computeMediaTrustedPaths(db)).toEqual([])
  })

  it('combines saved playlist track paths and liked track paths', () => {
    createMediaPlaylist(db, 'p1', 'My Playlist')
    setMediaPlaylistTracks(db, 'p1', [{ path: 'C:/a.mp3', name: 'a.mp3' }])
    toggleTrackLike(db, 'C:/b.mp3', 'b.mp3')
    expect(computeMediaTrustedPaths(db).sort()).toEqual(['C:/a.mp3', 'C:/b.mp3'])
  })
})
