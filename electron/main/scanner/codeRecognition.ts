import { parseCanonicalGameCode } from '../../../shared/gameCode'
import type { GameCode } from '../../../shared/types/scanner'

// \b treats underscore as a word character, so a plain \b(RJ|VJ|ST)(\d+)\b
// pattern fails on DLsite's own most common naming convention - code and
// title joined by an underscore, e.g. "RJ01234567_작품명" - since there's
// no word/non-word transition between the last digit and the underscore.
// Lookaround assertions replace both boundaries: not preceded by a letter
// or digit (still rejects an embedded match like "COST1234"), not followed
// by another digit (still rejects a longer number swallowing extra digits).
// Underscore, space, punctuation, Korean text, or end-of-string are all
// acceptable on either side.
const CODE_PATTERN = /(?<![A-Za-z0-9])((?:RJ|VJ|ST|VNV|VNR|GC)\d+)(?![0-9])/i

export function extractCode(name: string): GameCode | null {
  const match = CODE_PATTERN.exec(name)
  return match ? parseCanonicalGameCode(match[1]) : null
}
