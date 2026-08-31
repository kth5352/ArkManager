import { buildMediaThumbnailUrl, buildMediaPlaylistCoverUrl } from '../services/mediaThumbnailProtocolService'

export type PlaylistThumbnailSource =
  | { kind: 'cover'; url: string }
  | { kind: 'grid'; tileUrls: (string | null)[] }

// Priority: a user-set cover always wins; otherwise a 2x2 grid built from
// the playlist's own first 4 tracks' existing per-track thumbnails (no new
// backend resolution needed - buildMediaThumbnailUrl already exists for
// arbitrary track paths). Always returns exactly 4 tileUrls in the grid
// case, padding with null for a playlist with fewer than 4 tracks - the
// caller renders a null tile as an empty placeholder square.
export function computePlaylistThumbnailSource(
  hasCoverImage: boolean,
  playlistId: string,
  trackPaths: string[]
): PlaylistThumbnailSource {
  if (hasCoverImage) return { kind: 'cover', url: buildMediaPlaylistCoverUrl(playlistId) }
  const tileUrls: (string | null)[] = [0, 1, 2, 3].map((i) =>
    trackPaths[i] ? buildMediaThumbnailUrl(trackPaths[i]) : null
  )
  return { kind: 'grid', tileUrls }
}
