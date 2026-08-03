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
