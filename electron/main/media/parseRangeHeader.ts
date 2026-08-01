export interface ByteRange {
  start: number
  end: number
}

// Parses an HTTP Range header (RFC 7233 §2.1's single-range byte-range-spec,
// the only form <video>/<audio> elements ever actually send) against a known
// file size. Returns null for anything malformed or unsatisfiable, so the
// caller can fall back to a 416 response rather than serving garbage bytes.
export function parseRangeHeader(rangeHeader: string, fileSize: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) return null
  const [, startStr, endStr] = match
  if (startStr === '' && endStr === '') return null

  let start: number
  let end: number
  if (startStr === '') {
    // Suffix range ("bytes=-500" -> last 500 bytes).
    const suffixLength = parseInt(endStr, 10)
    start = Math.max(0, fileSize - suffixLength)
    end = fileSize - 1
  } else {
    start = parseInt(startStr, 10)
    end = endStr === '' ? fileSize - 1 : parseInt(endStr, 10)
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) return null
  return { start, end: Math.min(end, fileSize - 1) }
}
