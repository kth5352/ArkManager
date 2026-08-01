// Matches electron/main/mediaProtocol.ts's decodeFilePath exactly (a plain
// encodeURIComponent of the file's own path) - kept as a pure function
// rather than a query hook, since building the URL needs no IPC round trip.
// The <video>/<audio> element loads this directly through Chromium's own
// network stack (with Range-request seeking support), not through IPC.
export function buildMediaUrl(filePath: string): string {
  return `media://file/${encodeURIComponent(filePath)}`
}
