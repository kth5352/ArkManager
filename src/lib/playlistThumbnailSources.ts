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
//
// coverVersion is an optional cache-busting counter, same pattern as
// MediaPage.tsx's per-track refreshToken: buildMediaPlaylistCoverUrl
// returns a stable URL keyed only on playlistId, so the browser's own <img>
// cache would otherwise keep showing the old cover after
// useSetPlaylistCover/useClearPlaylistCover succeed. Defaulting to 0 (no
// query string appended) keeps every existing caller/test byte-for-byte
// unchanged; only PlaylistDetailView, which actually lets the cover be
// edited, needs to pass a real, bumped value.
export function computePlaylistThumbnailSource(
  hasCoverImage: boolean,
  playlistId: string,
  trackPaths: string[],
  coverVersion = 0
): PlaylistThumbnailSource {
  if (hasCoverImage) {
    const url = buildMediaPlaylistCoverUrl(playlistId)
    return { kind: 'cover', url: coverVersion > 0 ? `${url}?v=${coverVersion}` : url }
  }
  const tileUrls: (string | null)[] = [0, 1, 2, 3].map((i) =>
    trackPaths[i] ? buildMediaThumbnailUrl(trackPaths[i]) : null
  )
  return { kind: 'grid', tileUrls }
}
