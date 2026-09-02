import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

// -c copy repackages the existing video/audio streams into an ISO-BMFF
// container without re-encoding - no CPU-bound transcoding, just a
// sequential read/write of the whole file, so even a multi-GB concert
// recording finishes once the disk has streamed through it once. The
// timeout is far more generous than extractVideoFrame.ts's 15s single-
// frame grab specifically because this reads the ENTIRE file, not one
// frame - a large file on a slow/external drive genuinely needs more than
// a few seconds, and killing the process partway through would leave a
// half-written, non-playable output file; 5 minutes comfortably covers a
// multi-hour concert recording even on a slow drive while still failing
// fast for a genuinely stuck/corrupt input rather than hanging forever.
// -movflags +faststart moves the moov atom to the front of the output,
// which mediaProtocol.ts's own byte-range serving benefits from the same
// way any web-served mp4 does (playback can start after the first
// response instead of needing a second range request to find moov at the
// end of the file).
const REMUX_TIMEOUT_MS = 5 * 60 * 1000

export async function remuxMpegTsToMp4(filePath: string, outputPath: string): Promise<boolean> {
  if (!ffmpegPath) return false
  try {
    await execFileAsync(
      ffmpegPath,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostats',
        '-i',
        filePath,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      // Node's execFile defaults to a 1 MiB combined stdout+stderr buffer,
      // which a real-world multi-hour capture can exceed via ffmpeg's own
      // stderr warnings (e.g. "Non-monotonous DTS") even with -loglevel
      // error trimming most of them - exceeding it kills the process
      // (caught by the catch below) after minutes of wasted work, so this
      // is uncapped rather than raised to some other finite number.
      { timeout: REMUX_TIMEOUT_MS, maxBuffer: Infinity }
    )
    return true
  } catch {
    return false
  }
}
