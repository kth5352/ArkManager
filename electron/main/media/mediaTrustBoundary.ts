import type { AppDatabase } from '../database/client'
import { listLibraries } from '../database/librariesRepository'
import { getSetting } from '../database/settingsRepository'
import { listAllPlaylistTrackPaths } from '../database/mediaPlaylistsRepository'
import { listLikedTracks } from '../database/mediaTrackLikesRepository'

// Every media:// / mediathumb:// / lyrics / thumbnail-override consumer
// needs the same two trust sources - hand-rolling this in each handler is
// exactly what let mediaLyricsHandlers.ts and mediaThumbnailHandlers.ts
// silently drift out of sync with mediaProtocol.ts/mediaThumbnailProtocol.ts
// (a saved playlist/liked track stayed playable and thumbnail-able after
// media-folder changed, but its lyrics and manual thumbnail override did
// not) - see
// docs/superpowers/specs/2026-09-02-media-playback-trust-boundary-fix-design.md.
export function computeMediaAllowedRoots(db: AppDatabase): string[] {
  const libraryPaths = listLibraries(db).map((library) => library.path)
  const mediaFolder = getSetting(db, 'media-folder')
  return mediaFolder ? [...libraryPaths, mediaFolder] : libraryPaths
}

export function computeMediaTrustedPaths(db: AppDatabase): string[] {
  return [...listAllPlaylistTrackPaths(db), ...listLikedTracks(db).map((track) => track.path)]
}
