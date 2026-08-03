import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

// Extracts an attached-picture stream (ID3 APIC for MP3, similar tags for
// FLAC/OGG/M4A - ffmpeg handles the per-format differences itself) if the
// audio file has one embedded. Fails (returns false, not an error) exactly
// as often as a file simply has no embedded art - same "false = nothing
// available, try the next tier" contract as extractVideoFrame.
export async function extractAudioArt(audioPath: string, outputPath: string): Promise<boolean> {
  if (!ffmpegPath) return false
  try {
    await execFileAsync(
      ffmpegPath,
      ['-y', '-i', audioPath, '-an', '-vcodec', 'copy', outputPath],
      { timeout: 15000 }
    )
    return true
  } catch {
    return false
  }
}
