import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { mediaPlaylists, mediaPlaylistTracks } from './schema'
import type { MediaPlaylistDto, MediaPlaylistTrackDto } from '../../../shared/types/ipc'

export function listMediaPlaylists(db: AppDatabase): MediaPlaylistDto[] {
  const playlists = db.select().from(mediaPlaylists).all()
  const allTracks = db.select().from(mediaPlaylistTracks).all()
  return playlists.map((playlist) => ({
    id: playlist.id,
    name: playlist.name,
    trackCount: allTracks.filter((track) => track.playlistId === playlist.id).length,
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
  }))
}

export function createMediaPlaylist(db: AppDatabase, id: string, name: string): void {
  const now = new Date().toISOString()
  db.insert(mediaPlaylists).values({ id, name, createdAt: now, updatedAt: now }).run()
}

export function renameMediaPlaylist(db: AppDatabase, id: string, name: string): void {
  db.update(mediaPlaylists)
    .set({ name, updatedAt: new Date().toISOString() })
    .where(eq(mediaPlaylists.id, id))
    .run()
}

export function deleteMediaPlaylist(db: AppDatabase, id: string): void {
  db.transaction((tx) => {
    tx.delete(mediaPlaylistTracks).where(eq(mediaPlaylistTracks.playlistId, id)).run()
    tx.delete(mediaPlaylists).where(eq(mediaPlaylists.id, id)).run()
  })
}

export function getMediaPlaylistTracks(db: AppDatabase, id: string): MediaPlaylistTrackDto[] {
  return db
    .select()
    .from(mediaPlaylistTracks)
    .where(eq(mediaPlaylistTracks.playlistId, id))
    .orderBy(mediaPlaylistTracks.position)
    .all()
    .map((track) => ({ path: track.path, name: track.name }))
}

// Full replace, not an upsert - mirrors saveExplorerTabs's delete-all-then-
// reinsert pattern (explorerTabsRepository.ts), since the caller always
// sends its complete, current track order (including reorders/removals)
// rather than an incremental diff.
export function setMediaPlaylistTracks(
  db: AppDatabase,
  id: string,
  tracks: MediaPlaylistTrackDto[]
): void {
  db.transaction((tx) => {
    tx.delete(mediaPlaylistTracks).where(eq(mediaPlaylistTracks.playlistId, id)).run()
    tracks.forEach((track, position) => {
      tx.insert(mediaPlaylistTracks)
        .values({ playlistId: id, position, path: track.path, name: track.name })
        .run()
    })
    tx.update(mediaPlaylists)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(mediaPlaylists.id, id))
      .run()
  })
}
