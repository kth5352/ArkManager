import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import {
  listMediaPlaylists,
  createMediaPlaylist,
  renameMediaPlaylist,
  deleteMediaPlaylist,
  getMediaPlaylistTracks,
  setMediaPlaylistTracks,
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
