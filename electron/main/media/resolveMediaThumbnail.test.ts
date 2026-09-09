import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import sharp from 'sharp'
import { resolveMediaThumbnail } from './resolveMediaThumbnail'

async function writeFakeFrame(outputPath: string): Promise<void> {
  await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
    .png()
    .toFile(outputPath)
}

describe('resolveMediaThumbnail', () => {
  let dir: string
  let cacheDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-thumb-'))
    cacheDir = join(dir, 'cache')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('extracts and caches a video frame on first request', async () => {
    const videoPath = join(dir, 'clip.mp4')
    await writeFile(videoPath, '')
    let calls = 0
    const deps = {
      extractVideoFrame: async (_video: string, outputPath: string) => {
        calls++
        await writeFakeFrame(outputPath)
        return true
      },
      extractAudioArt: async () => false,
      findThumbnailPath: async () => null,
    }

    const result = await resolveMediaThumbnail(cacheDir, videoPath, true, deps)

    expect(result).not.toBeNull()
    expect(calls).toBe(1)
    await expect(access(result!)).resolves.toBeUndefined()
  })

  it('reuses the cached file on a second request instead of extracting again', async () => {
    const videoPath = join(dir, 'clip.mp4')
    await writeFile(videoPath, '')
    let calls = 0
    const deps = {
      extractVideoFrame: async (_video: string, outputPath: string) => {
        calls++
        await writeFakeFrame(outputPath)
        return true
      },
      extractAudioArt: async () => false,
      findThumbnailPath: async () => null,
    }

    const first = await resolveMediaThumbnail(cacheDir, videoPath, true, deps)
    const second = await resolveMediaThumbnail(cacheDir, videoPath, true, deps)

    expect(second).toBe(first)
    expect(calls).toBe(1)
  })

  it('returns null for a video with no extractable frame, without trying a directory image', async () => {
    const videoPath = join(dir, 'clip.mp4')
    await writeFile(videoPath, '')
    let findThumbnailCalls = 0
    const deps = {
      extractVideoFrame: async () => false,
      extractAudioArt: async () => false,
      findThumbnailPath: async () => {
        findThumbnailCalls++
        return null
      },
    }

    const result = await resolveMediaThumbnail(cacheDir, videoPath, true, deps)

    expect(result).toBeNull()
    expect(findThumbnailCalls).toBe(0)
  })

  it('extracts and caches embedded audio art on first request', async () => {
    const audioPath = join(dir, 'song.mp3')
    await writeFile(audioPath, '')
    const deps = {
      extractVideoFrame: async () => false,
      extractAudioArt: async (_audio: string, outputPath: string) => {
        await writeFakeFrame(outputPath)
        return true
      },
      findThumbnailPath: async () => null,
    }

    const result = await resolveMediaThumbnail(cacheDir, audioPath, false, deps)

    expect(result).not.toBeNull()
    await expect(access(result!)).resolves.toBeUndefined()
  })

  it('falls back to a directory image when an audio file has no embedded art, caching it under the track key', async () => {
    const audioPath = join(dir, 'song.mp3')
    await writeFile(audioPath, '')
    const folderImage = join(dir, 'cover.jpg')
    await writeFakeFrame(folderImage)
    const deps = {
      extractVideoFrame: async () => false,
      extractAudioArt: async () => false,
      findThumbnailPath: async (folderPath: string) => (folderPath === dir ? folderImage : null),
    }

    const result = await resolveMediaThumbnail(cacheDir, audioPath, false, deps)

    // Cached (not the raw source path) - see resolveMediaThumbnail.ts's own
    // comment on why an arbitrary directory image must never be served
    // as-is: nothing bounds its size, and it would otherwise be re-read on
    // every single request forever (this exact real-world case, a 7.5MB
    // directory image served unresized/uncached on every visit, is what
    // this test guards against).
    expect(result).not.toBe(folderImage)
    expect(result).not.toBeNull()
    expect(result!.startsWith(cacheDir)).toBe(true)
    await expect(access(result!)).resolves.toBeUndefined()
  })

  it('reuses the cached directory-image fallback on a second request instead of re-scanning the folder', async () => {
    const audioPath = join(dir, 'song.mp3')
    await writeFile(audioPath, '')
    const folderImage = join(dir, 'cover.jpg')
    await writeFakeFrame(folderImage)
    let findThumbnailCalls = 0
    const deps = {
      extractVideoFrame: async () => false,
      extractAudioArt: async () => false,
      findThumbnailPath: async (folderPath: string) => {
        findThumbnailCalls++
        return folderPath === dir ? folderImage : null
      },
    }

    const first = await resolveMediaThumbnail(cacheDir, audioPath, false, deps)
    const second = await resolveMediaThumbnail(cacheDir, audioPath, false, deps)

    expect(second).toBe(first)
    expect(findThumbnailCalls).toBe(1)
  })

  it('returns null when an audio file has neither embedded art nor a directory image', async () => {
    const audioPath = join(dir, 'song.mp3')
    await writeFile(audioPath, '')
    const deps = {
      extractVideoFrame: async () => false,
      extractAudioArt: async () => false,
      findThumbnailPath: async () => null,
    }

    const result = await resolveMediaThumbnail(cacheDir, audioPath, false, deps)

    expect(result).toBeNull()
  })

  it('does not re-run ffmpeg extraction on a second request for a track with no thumbnail', async () => {
    const audioPath = join(dir, 'song.mp3')
    await writeFile(audioPath, '')
    let extractCalls = 0
    const deps = {
      extractVideoFrame: async () => false,
      extractAudioArt: async () => {
        extractCalls++
        return false
      },
      findThumbnailPath: async () => null,
    }

    const first = await resolveMediaThumbnail(cacheDir, audioPath, false, deps)
    const second = await resolveMediaThumbnail(cacheDir, audioPath, false, deps)

    expect(first).toBeNull()
    expect(second).toBeNull()
    // The real regression: every prior request re-paid the full extraction
    // cost - including ffmpeg's own up-to-15s timeout - for a file that will
    // never produce a thumbnail.
    expect(extractCalls).toBe(1)
  })

  it('does re-attempt extraction after a transient read/save failure (not cached negatively)', async () => {
    const videoPath = join(dir, 'clip.mp4')
    await writeFile(videoPath, '')
    let extractCalls = 0
    const deps = {
      // Reports success but never actually writes outputPath - readFile
      // inside resolveMediaThumbnail then throws, landing in the catch
      // block that must NOT be treated as "no thumbnail exists".
      extractVideoFrame: async () => {
        extractCalls++
        return true
      },
      extractAudioArt: async () => false,
      findThumbnailPath: async () => null,
    }

    const first = await resolveMediaThumbnail(cacheDir, videoPath, true, deps)
    const second = await resolveMediaThumbnail(cacheDir, videoPath, true, deps)

    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(extractCalls).toBe(2)
  })

  it('extracts to a .jpg temp path, not a muxer-ambiguous extension like .tmp', async () => {
    const videoPath = join(dir, 'clip.mp4')
    await writeFile(videoPath, '')
    let capturedOutputPath = ''
    const deps = {
      extractVideoFrame: async (_video: string, outputPath: string) => {
        capturedOutputPath = outputPath
        await writeFakeFrame(outputPath)
        return true
      },
      extractAudioArt: async () => false,
      findThumbnailPath: async () => null,
    }

    await resolveMediaThumbnail(cacheDir, videoPath, true, deps)

    expect(capturedOutputPath).not.toBe('')
    expect(extname(capturedOutputPath)).toBe('.jpg')
  })

  it('uses a unique temp path per call for DIFFERENT files resolving at the same time', async () => {
    const videoPathA = join(dir, 'clip-a.mp4')
    const videoPathB = join(dir, 'clip-b.mp4')
    await writeFile(videoPathA, '')
    await writeFile(videoPathB, '')
    const capturedOutputPaths: string[] = []
    const deps = {
      extractVideoFrame: async (_video: string, outputPath: string) => {
        capturedOutputPaths.push(outputPath)
        await writeFakeFrame(outputPath)
        return true
      },
      extractAudioArt: async () => false,
      findThumbnailPath: async () => null,
    }

    await Promise.all([
      resolveMediaThumbnail(cacheDir, videoPathA, true, deps),
      resolveMediaThumbnail(cacheDir, videoPathB, true, deps),
    ])

    expect(capturedOutputPaths).toHaveLength(2)
    expect(capturedOutputPaths[0]).not.toBe(capturedOutputPaths[1])
  })

  it('merges concurrent requests for the SAME uncached file into a single extraction, not one each', async () => {
    const videoPath = join(dir, 'clip.mp4')
    await writeFile(videoPath, '')
    let extractCalls = 0
    const deps = {
      extractVideoFrame: async (_video: string, outputPath: string) => {
        extractCalls++
        // A real delay so the two calls below genuinely overlap in time
        // instead of the first one finishing before the second even starts.
        await new Promise((resolve) => setTimeout(resolve, 10))
        await writeFakeFrame(outputPath)
        return true
      },
      extractAudioArt: async () => false,
      findThumbnailPath: async () => null,
    }

    const [a, b] = await Promise.all([
      resolveMediaThumbnail(cacheDir, videoPath, true, deps),
      resolveMediaThumbnail(cacheDir, videoPath, true, deps),
    ])

    // Not just "both succeeded" - before merging existed, a synthetic
    // benchmark found the SECOND of two concurrent calls could genuinely
    // fail (return null) because both independently called
    // saveCustomCoverImage (sharp().toFile()) against the same destination
    // path at once. Merging means only one of those calls ever happens.
    expect(extractCalls).toBe(1)
    expect(a).not.toBeNull()
    expect(b).toBe(a)
  })

  it('removes the in-flight entry once settled, so a later non-concurrent request checks the cache fresh', async () => {
    const videoPath = join(dir, 'clip.mp4')
    await writeFile(videoPath, '')
    let extractCalls = 0
    const deps = {
      extractVideoFrame: async (_video: string, outputPath: string) => {
        extractCalls++
        await writeFakeFrame(outputPath)
        return true
      },
      extractAudioArt: async () => false,
      findThumbnailPath: async () => null,
    }
    const inFlight = new Map<string, Promise<string | null>>()

    const first = await resolveMediaThumbnail(cacheDir, videoPath, true, deps, inFlight)
    expect(inFlight.size).toBe(0)
    const second = await resolveMediaThumbnail(cacheDir, videoPath, true, deps, inFlight)

    expect(second).toBe(first)
    // The second call hit the on-disk cache check, not a lingering
    // in-flight entry - extraction only ran once, and the Map is provably
    // empty in between.
    expect(extractCalls).toBe(1)
  })

  it('accepts an injected in-flight Map so tests never share the module-level production singleton', async () => {
    const videoPath = join(dir, 'clip.mp4')
    await writeFile(videoPath, '')
    const deps = {
      extractVideoFrame: async (_video: string, outputPath: string) => {
        await writeFakeFrame(outputPath)
        return true
      },
      extractAudioArt: async () => false,
      findThumbnailPath: async () => null,
    }
    const ownInFlight = new Map<string, Promise<string | null>>()

    const result = await resolveMediaThumbnail(cacheDir, videoPath, true, deps, ownInFlight)

    expect(result).not.toBeNull()
    expect(ownInFlight.size).toBe(0)
  })

  it('caps concurrent ffmpeg extraction calls at 2 across multiple DIFFERENT uncached files', async () => {
    const paths = Array.from({ length: 6 }, (_, i) => join(dir, `clip-${i}.mp4`))
    await Promise.all(paths.map((p) => writeFile(p, '')))

    let active = 0
    let peak = 0
    const deps = {
      extractVideoFrame: async (_video: string, outputPath: string) => {
        active++
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active--
        await writeFakeFrame(outputPath)
        return true
      },
      extractAudioArt: async () => false,
      findThumbnailPath: async () => null,
    }

    await Promise.all(paths.map((p) => resolveMediaThumbnail(cacheDir, p, true, deps)))

    expect(peak).toBeLessThanOrEqual(2)
  })
})
