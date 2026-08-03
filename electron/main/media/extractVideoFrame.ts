import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

// Grabs a single frame 1 second into the video as the thumbnail source - a
// fixed offset avoids needing to probe the video's duration first; ffmpeg's
// own end-of-stream handling still produces a frame for a video shorter
// than 1s. execFile takes an argument array (never a shell string, unlike
// readExeFileVersion.ts's PowerShell exec which needed careful quoting) -
// nothing here is vulnerable to shell metacharacter injection from a
// crafted file path.
export async function extractVideoFrame(videoPath: string, outputPath: string): Promise<boolean> {
  if (!ffmpegPath) return false
  try {
    await execFileAsync(
      ffmpegPath,
      ['-y', '-ss', '00:00:01', '-i', videoPath, '-frames:v', '1', '-q:v', '2', outputPath],
      { timeout: 15000 }
    )
    return true
  } catch {
    return false
  }
}
