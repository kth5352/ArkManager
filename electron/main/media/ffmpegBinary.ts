import { existsSync } from 'node:fs'
import ffmpegPath from 'ffmpeg-static'

// ffmpeg-static downloads its binary in a postinstall step, so a checkout that
// ran `npm ci --ignore-scripts` (or lost the file) has the path but no file.
// That is an environment problem, NOT "this media has no artwork": the
// extractors throw so the artwork resolver treats it as a transient failure
// and never caches a permanent `.notfound` for it.
export class FfmpegUnavailableError extends Error {
  constructor() {
    super('ffmpeg binary is not available')
    this.name = 'FfmpegUnavailableError'
  }
}

export function requireFfmpegPath(
  path: string | null = ffmpegPath,
  exists: (p: string) => boolean = existsSync
): string {
  if (!path || !exists(path)) throw new FfmpegUnavailableError()
  return path
}
