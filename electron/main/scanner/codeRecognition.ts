import type { GameCode, GameCodeType } from '../../../shared/types/scanner'

// \b treats underscore as a word character, so a plain \b(RJ|VJ|ST)(\d+)\b
// pattern fails on DLsite's own most common naming convention - code and
// title joined by an underscore, e.g. "RJ01234567_작품명" - since there's
// no word/non-word transition between the last digit and the underscore.
// Lookaround assertions replace both boundaries: not preceded by a letter
// or digit (still rejects an embedded match like "COST1234"), not followed
// by another digit (still rejects a longer number swallowing extra digits).
// Underscore, space, punctuation, Korean text, or end-of-string are all
// acceptable on either side.
const CODE_PATTERN = /(?<![A-Za-z0-9])((?:RJ|VJ|ST|VN|VR|GC)\d+|[vr]\d+)(?![0-9])/i

export function extractCode(name: string): GameCode | null {
  const match = CODE_PATTERN.exec(name)
  if (!match) return null
  const raw = match[1]
  const lower = raw.toLowerCase()
  if (/^v\d/i.test(raw)) {
    return { type: 'VN', value: `VN${raw.slice(1)}` }
  }
  if (lower.startsWith('r') && !lower.startsWith('rj')) {
    return { type: 'VR', value: `VR${raw.slice(1)}` }
  }
  const type = raw.slice(0, 2).toUpperCase() as GameCodeType
  return { type, value: `${type}${raw.slice(2)}` }
}
