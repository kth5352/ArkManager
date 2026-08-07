export interface SyncedLyricLine {
  time: number
  text: string
}

export type ParsedLyrics =
  | { kind: 'synced'; lines: SyncedLyricLine[] }
  | { kind: 'static'; lines: string[] }

const TIMESTAMP_PATTERN = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g

export function parseLrc(text: string): ParsedLyrics {
  const lines: SyncedLyricLine[] = []

  for (const sourceLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const timestamps = [...sourceLine.matchAll(TIMESTAMP_PATTERN)]
    if (timestamps.length === 0) continue

    const lyricText = sourceLine.replace(TIMESTAMP_PATTERN, '').trim()
    if (!lyricText) continue

    for (const timestamp of timestamps) {
      const minutes = Number(timestamp[1])
      const seconds = Number(timestamp[2])
      const fraction = timestamp[3] ? Number(`0.${timestamp[3]}`) : 0
      lines.push({ time: minutes * 60 + seconds + fraction, text: lyricText })
    }
  }

  if (lines.length > 0) {
    return { kind: 'synced', lines: lines.sort((a, b) => a.time - b.time) }
  }

  return { kind: 'static', lines: text.replace(/^\uFEFF/, '').split(/\r?\n/) }
}

export function getActiveLyricLine(
  parsed: ParsedLyrics,
  currentTime: number
): SyncedLyricLine | null {
  if (parsed.kind !== 'synced') return null

  let active: SyncedLyricLine | null = null
  for (const line of parsed.lines) {
    if (line.time > currentTime) break
    active = line
  }
  return active
}
