import type { ParsedLyrics, SyncedLyricLine } from './lrc'

const BOM_PATTERN = /^\uFEFF/
const CUE_TIMING_PATTERN = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})\s*-->/

function parseTimestamp(hours: string | undefined, minutes: string, seconds: string, millis: string): number {
  const h = hours ? Number(hours) : 0
  return h * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000
}

// A WebVTT cue is a timing line ("[HH:]MM:SS.mmm --> [HH:]MM:SS.mmm", the end
// timestamp and any cue settings after it are ignored - see lrc.ts's own
// ParsedLyrics, which likewise only tracks a single start time per line)
// optionally preceded by a cue identifier line, followed by one or more text
// lines up to the next blank line. Everything outside that shape (the
// leading WEBVTT header, NOTE/STYLE blocks, cue identifiers) is skipped.
export function parseVtt(text: string): ParsedLyrics {
  const rawLines = text.replace(BOM_PATTERN, '').split(/\r?\n/)
  const lines: SyncedLyricLine[] = []

  for (let i = 0; i < rawLines.length; i++) {
    const match = CUE_TIMING_PATTERN.exec(rawLines[i])
    if (!match) continue

    const time = parseTimestamp(match[1], match[2], match[3], match[4])
    const textLines: string[] = []
    let j = i + 1
    while (j < rawLines.length && rawLines[j].trim() !== '') {
      textLines.push(rawLines[j])
      j++
    }
    if (textLines.length > 0) {
      lines.push({ time, text: textLines.join('\n') })
    }
    i = j
  }

  if (lines.length > 0) {
    return { kind: 'synced', lines: lines.sort((a, b) => a.time - b.time) }
  }

  return { kind: 'static', lines: rawLines }
}
