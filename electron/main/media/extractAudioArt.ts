import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

// Extracts an attached-picture stream (ID3 APIC for MP3, similar tags for
// FLAC/OGG/M4A - ffmpeg handles the per-format differences itself) if the
// audio file has one embedded. Fails (returns false, not an error) exactly
// as often as a file simply has no embedded art - same "false = nothing
// available, try the next tier" contract as extractVideoFrame. Re-encodes
// to JPEG (like a normal frame extraction) rather than stream-copying the
// embedded art's original codec - `-vcodec copy` only works when that
// codec happens to already match what the output extension implies, which
// isn't guaranteed for embedded art in general, so copy fails far more
// often than it should.
export async function extractAudioArt(audioPath: string, outputPath: string): Promise<boolean> {
  if (!ffmpegPath) return false
  try {
    await execFileAsync(
      ffmpegPath,
      ['-y', '-i', audioPath, '-an', '-frames:v', '1', '-q:v', '2', outputPath],
      { timeout: 15000 }
    )
    return true
  } catch {
    return false
  }
}
