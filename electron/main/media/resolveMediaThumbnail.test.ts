import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

  it('falls back to a directory image when an audio file has no embedded art', async () => {
    const audioPath = join(dir, 'song.mp3')
    await writeFile(audioPath, '')
    const folderImage = join(dir, 'cover.jpg')
    await writeFile(folderImage, '')
    const deps = {
      extractVideoFrame: async () => false,
      extractAudioArt: async () => false,
      findThumbnailPath: async (folderPath: string) => (folderPath === dir ? folderImage : null),
    }

    const result = await resolveMediaThumbnail(cacheDir, audioPath, false, deps)

    expect(result).toBe(folderImage)
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
})
