import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolvePlayableMediaPath } from './resolvePlayableMediaPath'
import { keyToSafeDirName } from '../save/keyToSafeDirName'

describe('resolvePlayableMediaPath', () => {
  let dir: string
  let cacheDir: string
  let filePath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-remux-'))
    cacheDir = join(dir, 'cache')
    filePath = join(dir, 'clip.mp4')
    await writeFile(filePath, '')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns the cache path when already cached, without probing the file', async () => {
    await mkdir(cacheDir, { recursive: true })
    const cachePath = join(cacheDir, `${keyToSafeDirName(filePath)}.mp4`)
    await writeFile(cachePath, 'cached')
    let probeCalls = 0
    const deps = {
      isLikelyMpegTsStream: async () => {
        probeCalls++
        return true
      },
      remuxMpegTsToMp4: async () => true,
    }

    const result = await resolvePlayableMediaPath(cacheDir, filePath, deps)

    expect(result).toBe(cachePath)
    expect(probeCalls).toBe(0)
  })

  it('returns the original path unchanged when the file is not MPEG-TS', async () => {
    let remuxCalls = 0
    const deps = {
      isLikelyMpegTsStream: async () => false,
      remuxMpegTsToMp4: async () => {
        remuxCalls++
        return true
      },
    }

    const result = await resolvePlayableMediaPath(cacheDir, filePath, deps)

    expect(result).toBe(filePath)
    expect(remuxCalls).toBe(0)
  })

  it('remuxes and caches when the file is MPEG-TS', async () => {
    const deps = {
      isLikelyMpegTsStream: async () => true,
      remuxMpegTsToMp4: async (_input: string, outputPath: string) => {
        await writeFile(outputPath, 'remuxed')
        return true
      },
    }

    const result = await resolvePlayableMediaPath(cacheDir, filePath, deps)

    expect(result).not.toBe(filePath)
    expect(result.startsWith(cacheDir)).toBe(true)
    await expect(access(result)).resolves.toBeUndefined()
  })

  it('returns the original path when remux fails', async () => {
    const deps = {
      isLikelyMpegTsStream: async () => true,
      remuxMpegTsToMp4: async () => false,
    }

    const result = await resolvePlayableMediaPath(cacheDir, filePath, deps)

    expect(result).toBe(filePath)
  })

  it('reuses the cached result on a second call instead of re-probing', async () => {
    let probeCalls = 0
    const deps = {
      isLikelyMpegTsStream: async () => {
        probeCalls++
        return true
      },
      remuxMpegTsToMp4: async (_input: string, outputPath: string) => {
        await writeFile(outputPath, 'remuxed')
        return true
      },
    }

    const first = await resolvePlayableMediaPath(cacheDir, filePath, deps)
    const second = await resolvePlayableMediaPath(cacheDir, filePath, deps)

    expect(second).toBe(first)
    expect(probeCalls).toBe(1)
  })

  it('uses a unique temp path per call so concurrent requests for the same file do not collide', async () => {
    const capturedOutputPaths: string[] = []
    const deps = {
      isLikelyMpegTsStream: async () => true,
      remuxMpegTsToMp4: async (_input: string, outputPath: string) => {
        capturedOutputPaths.push(outputPath)
        await writeFile(outputPath, 'remuxed')
        return true
      },
    }

    await Promise.all([
      resolvePlayableMediaPath(cacheDir, filePath, deps),
      resolvePlayableMediaPath(cacheDir, filePath, deps),
    ])

    expect(capturedOutputPaths).toHaveLength(2)
    expect(capturedOutputPaths[0]).not.toBe(capturedOutputPaths[1])
  })
})
