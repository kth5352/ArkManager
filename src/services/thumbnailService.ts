// Matches electron/main/thumbnailProtocol.ts's decodeEntryPath exactly (a
// plain encodeURIComponent of the folder's own path) - kept as a pure
// function rather than a query hook, since building the URL needs no IPC
// round trip. The browser's own <img> loading (via GameThumbnail) hits this
// URL directly through Chromium's network stack; whether a thumbnail
// actually exists is only known once that request resolves (see
// GameThumbnail's onError), not upfront.
export function buildThumbnailUrl(entryPath: string): string {
  return `thumb://thumbnail/${encodeURIComponent(entryPath)}`
}
