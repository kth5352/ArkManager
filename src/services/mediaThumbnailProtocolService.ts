// Matches electron/main/mediaThumbnailProtocol.ts's decodeFilePath exactly
// (a plain encodeURIComponent of the file's own path) - kept as a pure
// function rather than a query hook, same reasoning as buildThumbnailUrl:
// the <img> element loads this directly through Chromium's own network
// stack, no IPC round trip. Whether a thumbnail actually exists is only
// known once that request resolves (onError on the consuming <img>), not
// upfront - same as thumb://.
//
// `version` (from MediaCoverInfo.version) is only a cache-buster appended as a
// query; the main process decodes the path from the pathname alone.
export function buildMediaThumbnailUrl(filePath: string, version?: string): string {
  const base = `mediathumb://thumbnail/${encodeURIComponent(filePath)}`
  return version === undefined ? base : `${base}?v=${encodeURIComponent(version)}`
}

// The 2048px cover served by the same protocol (host 'cover').
export function buildMediaCoverUrl(filePath: string, version: string): string {
  return `mediathumb://cover/${encodeURIComponent(filePath)}?v=${encodeURIComponent(version)}`
}

// Same hostname-branching contract as electron/main/mediaThumbnailProtocol.ts's
// registerMediaThumbnailProtocolHandler - 'playlist-cover' resolves via the
// playlist's own cover_image_path column server-side, not a filesystem path,
// so no isPathWithinAnyLibrary check applies to this URL shape.
export function buildMediaPlaylistCoverUrl(playlistId: string): string {
  return `mediathumb://playlist-cover/${encodeURIComponent(playlistId)}`
}
