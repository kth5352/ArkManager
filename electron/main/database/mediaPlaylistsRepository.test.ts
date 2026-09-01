import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import {
  listMediaPlaylists,
  createMediaPlaylist,
  renameMediaPlaylist,
  deleteMediaPlaylist,
  getMediaPlaylistTracks,
  setMediaPlaylistTracks,
  setPlaylistCover,
  clearPlaylistCover,
  getPlaylistCoverPath,
  listAllPlaylistTrackPaths,
} from './mediaPlaylistsRepository'

describe('mediaPlaylistsRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('creates and lists playlists with a zero track count', () => {
    createMediaPlaylist(db, 'p1', 'My Playlist')
    const playlists = listMediaPlaylists(db)
    expect(playlists).toEqual([
      expect.objectContaining({ id: 'p1', name: 'My Playlist', trackCount: 0 }),
    ])
  })

  it('renames a playlist', () => {
    createMediaPlaylist(db, 'p1', 'Old Name')
    renameMediaPlaylist(db, 'p1', 'New Name')
    expect(listMediaPlaylists(db)[0].name).toBe('New Name')
  })

  it('deletes a playlist and its tracks', () => {
    createMediaPlaylist(db, 'p1', 'My Playlist')
    setMediaPlaylistTracks(db, 'p1', [{ path: 'C:/a.mp3', name: 'a.mp3' }])
    deleteMediaPlaylist(db, 'p1')
    expect(listMediaPlaylists(db)).toEqual([])
    expect(getMediaPlaylistTracks(db, 'p1')).toEqual([])
  })

  it('sets tracks as a full replace, preserving order', () => {
    createMediaPlaylist(db, 'p1', 'My Playlist')
    setMediaPlaylistTracks(db, 'p1', [
      { path: 'C:/a.mp3', name: 'a.mp3' },
      { path: 'C:/b.mp3', name: 'b.mp3' },
    ])
    setMediaPlaylistTracks(db, 'p1', [{ path: 'C:/b.mp3', name: 'b.mp3' }])
    expect(getMediaPlaylistTracks(db, 'p1')).toEqual([{ path: 'C:/b.mp3', name: 'b.mp3' }])
    expect(listMediaPlaylists(db)[0].trackCount).toBe(1)
  })
})

describe('media playlist cover repository functions', () => {
  let db: AppDatabase

  afterEach(() => {
    db.$client.close()
  })

  it('returns null for a playlist with no cover set', () => {
    db = createDbClient(':memory:')
    createMediaPlaylist(db, 'pl-1', 'Test Playlist')
    expect(getPlaylistCoverPath(db, 'pl-1')).toBeNull()
  })

  it('setPlaylistCover stores the path and getPlaylistCoverPath returns it', () => {
    db = createDbClient(':memory:')
    createMediaPlaylist(db, 'pl-1', 'Test Playlist')
    setPlaylistCover(db, 'pl-1', 'C:\\cache\\playlist-covers\\pl-1.webp')
    expect(getPlaylistCoverPath(db, 'pl-1')).toBe('C:\\cache\\playlist-covers\\pl-1.webp')
  })

  it('clearPlaylistCover resets the path to null', () => {
    db = createDbClient(':memory:')
    createMediaPlaylist(db, 'pl-1', 'Test Playlist')
    setPlaylistCover(db, 'pl-1', 'C:\\cache\\playlist-covers\\pl-1.webp')
    clearPlaylistCover(db, 'pl-1')
    expect(getPlaylistCoverPath(db, 'pl-1')).toBeNull()
  })

  it('listMediaPlaylists includes coverImagePath for each playlist', () => {
    db = createDbClient(':memory:')
    createMediaPlaylist(db, 'pl-1', 'Test Playlist')
    setPlaylistCover(db, 'pl-1', 'C:\\cache\\playlist-covers\\pl-1.webp')
    createMediaPlaylist(db, 'pl-2', 'No Cover Playlist')
    const playlists = listMediaPlaylists(db)
    expect(playlists.find((p) => p.id === 'pl-1')?.coverImagePath).toBe(
      'C:\\cache\\playlist-covers\\pl-1.webp'
    )
    expect(playlists.find((p) => p.id === 'pl-2')?.coverImagePath).toBeNull()
  })
})

describe('listAllPlaylistTrackPaths', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns an empty array when there are no playlists', () => {
    expect(listAllPlaylistTrackPaths(db)).toEqual([])
  })

  it('returns every track path from a single playlist', () => {
    createMediaPlaylist(db, 'p1', 'My Playlist')
    setMediaPlaylistTracks(db, 'p1', [
      { path: 'C:/a.mp3', name: 'a.mp3' },
      { path: 'C:/b.mp3', name: 'b.mp3' },
    ])
    expect(listAllPlaylistTrackPaths(db).sort()).toEqual(['C:/a.mp3', 'C:/b.mp3'])
  })

  it('deduplicates a path saved in more than one playlist', () => {
    createMediaPlaylist(db, 'p1', 'Playlist One')
    createMediaPlaylist(db, 'p2', 'Playlist Two')
    setMediaPlaylistTracks(db, 'p1', [{ path: 'C:/shared.mp3', name: 'shared.mp3' }])
    setMediaPlaylistTracks(db, 'p2', [
      { path: 'C:/shared.mp3', name: 'shared.mp3' },
      { path: 'C:/only-in-two.mp3', name: 'only-in-two.mp3' },
    ])
    expect(listAllPlaylistTrackPaths(db).sort()).toEqual(['C:/only-in-two.mp3', 'C:/shared.mp3'])
  })
})
