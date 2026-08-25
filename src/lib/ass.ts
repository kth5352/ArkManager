import type { ParsedLyrics, SyncedLyricLine } from './lrc'

const BOM_PATTERN = /^\uFEFF/
const TIME_PATTERN = /^(\d+):(\d{2}):(\d{2})\.(\d{2})$/

function parseAssTime(raw: string): number | null {
  const match = TIME_PATTERN.exec(raw.trim())
  if (!match) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 100
}

function cleanText(raw: string): string {
  return raw
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .trim()
}

// ASS/SSA subtitle scripts store lines under an [Events] section as
// "Dialogue: <fields...>,Text" rows - the Format: line just above declares
// column order (usually Layer/Start/End/Style/Name/MarginL/MarginR/MarginV/
// Effect/Text, but this reads the real Format line rather than assuming
// that order). Only Start and Text are used - see lrc.ts's own ParsedLyrics,
// which likewise only tracks a single start time per line, so End is
// ignored the same way parseVtt.ts ignores a cue's end timestamp. Text is
// the only field allowed to contain commas (per the ASS spec), so the line
// is split on commas only up to one less than the declared field count,
// leaving the remainder intact as Text regardless of its own content.
export function parseAss(text: string): ParsedLyrics {
  const rawLines = text.replace(BOM_PATTERN, '').split(/\r?\n/)
  const lines: SyncedLyricLine[] = []

  let inEvents = false
  let startIndex = -1
  let textIndex = -1
  let fieldCount = 0

  for (const line of rawLines) {
    const trimmed = line.trim()
    if (/^\[Events\]$/i.test(trimmed)) {
      inEvents = true
      continue
    }
    if (!inEvents) continue
    if (/^\[/.test(trimmed)) {
      inEvents = false
      continue
    }

    if (/^Format:/i.test(trimmed)) {
      const fields = trimmed
        .slice(trimmed.indexOf(':') + 1)
        .split(',')
        .map((field) => field.trim().toLowerCase())
      fieldCount = fields.length
      startIndex = fields.indexOf('start')
      textIndex = fields.indexOf('text')
      continue
    }

    if (!/^Dialogue:/i.test(trimmed) || startIndex === -1 || textIndex === -1) continue

    const body = trimmed.slice(trimmed.indexOf(':') + 1)
    const fields = body.split(',')
    if (fields.length < fieldCount) continue
    // Everything from the Text column onward, rejoined - undoes the naive
    // split() above for exactly the one field allowed to contain commas.
    const rawText = fields.slice(textIndex).join(',')
    const time = parseAssTime(fields[startIndex] ?? '')
    if (time === null) continue

    const cleaned = cleanText(rawText)
    if (cleaned) lines.push({ time, text: cleaned })
  }

  if (lines.length > 0) {
    return { kind: 'synced', lines: lines.sort((a, b) => a.time - b.time) }
  }

  return { kind: 'static', lines: rawLines }
}
