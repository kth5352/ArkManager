// Matches electron/main/mediaThumbnailProtocol.ts's decodeFilePath exactly
// (a plain encodeURIComponent of the file's own path) - kept as a pure
// function rather than a query hook, same reasoning as buildMediaUrl/
// buildThumbnailUrl: the <img> element loads this directly through
// Chromium's own network stack, no IPC round trip. Whether a thumbnail
// actually exists is only known once that request resolves (onError on the
// consuming <img>), not upfront - same as thumb://.
export function buildMediaThumbnailUrl(filePath: string): string {
  return `mediathumb://thumbnail/${encodeURIComponent(filePath)}`
}

// Same hostname-branching contract as electron/main/mediaThumbnailProtocol.ts's
// registerMediaThumbnailProtocolHandler - 'playlist-cover' resolves via the
// playlist's own cover_image_path column server-side, not a filesystem path,
// so no isPathWithinAnyLibrary check applies to this URL shape.
export function buildMediaPlaylistCoverUrl(playlistId: string): string {
  return `mediathumb://playlist-cover/${encodeURIComponent(playlistId)}`
}
