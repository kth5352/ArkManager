import { parseLrc, type ParsedLyrics } from './lrc'
import { parseVtt } from './vtt'
import { parseAss } from './ass'

// Dispatches to the right parser by the resolved lyrics file's own
// extension (readAdjacentLyrics/getMediaLyrics always returns the real
// matched file's path alongside its text - see mediaLyricsService.ts's
// MediaLyricsFile - so the caller never has to separately track which
// format it asked for). Anything that isn't .vtt/.ass (including an
// unrecognized extension) falls back to the LRC parser - the only format
// this app supported before this function existed, so an unknown
// extension degrades to the pre-existing behavior rather than a hard
// failure.
export function parseLyrics(text: string, filePath: string): ParsedLyrics {
  const dotIndex = filePath.lastIndexOf('.')
  const ext = dotIndex === -1 ? '' : filePath.slice(dotIndex).toLowerCase()
  if (ext === '.vtt') return parseVtt(text)
  if (ext === '.ass') return parseAss(text)
  return parseLrc(text)
}
