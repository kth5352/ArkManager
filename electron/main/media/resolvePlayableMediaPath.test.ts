import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { isAlreadyRemuxed, resolvePlayableMediaPath } from './resolvePlayableMediaPath'
import { keyToSafeDirName } from '../save/keyToSafeDirName'
import { normalizeForComparison } from '../thumbnailProtocol'

// Mirrors the cache-key derivation resolvePlayableMediaPath.ts itself uses
// (normalizeForComparison(resolve(filePath)) before hashing) - see fix #9's
// own comment there for why the raw filePath alone isn't enough.
function cacheKeyFor(path: string): string {
  return keyToSafeDirName(normalizeForComparison(resolve(path)))
}

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
    const cachePath = join(cacheDir, `${cacheKeyFor(filePath)}.mp4`)
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

  it('shares a single in-flight remux across concurrent requests for the same file', async () => {
    let remuxCalls = 0
    const deps = {
      isLikelyMpegTsStream: async () => true,
      remuxMpegTsToMp4: async (_input: string, outputPath: string) => {
        remuxCalls++
        await writeFile(outputPath, 'remuxed')
        return true
      },
    }

    const [first, second] = await Promise.all([
      resolvePlayableMediaPath(cacheDir, filePath, deps),
      resolvePlayableMediaPath(cacheDir, filePath, deps),
    ])

    expect(remuxCalls).toBe(1)
    expect(first).toBe(second)
    expect(first.startsWith(cacheDir)).toBe(true)
  })

  it('gives two sequential calls that each fail their own fresh attempt (the in-flight entry is cleared after failure)', async () => {
    let remuxCalls = 0
    const deps = {
      isLikelyMpegTsStream: async () => true,
      remuxMpegTsToMp4: async (_input: string, outputPath: string) => {
        remuxCalls++
        if (remuxCalls === 1) return false
        await writeFile(outputPath, 'remuxed')
        return true
      },
    }

    const first = await resolvePlayableMediaPath(cacheDir, filePath, deps)
    expect(first).toBe(filePath)

    const second = await resolvePlayableMediaPath(cacheDir, filePath, deps)

    expect(remuxCalls).toBe(2)
    expect(second).not.toBe(filePath)
    expect(second.startsWith(cacheDir)).toBe(true)
  })

  describe('isAlreadyRemuxed', () => {
    it('returns false when nothing is cached yet', async () => {
      await expect(isAlreadyRemuxed(cacheDir, filePath)).resolves.toBe(false)
    })

    it('returns true once the file has been cached', async () => {
      await mkdir(cacheDir, { recursive: true })
      const cachePath = join(cacheDir, `${cacheKeyFor(filePath)}.mp4`)
      await writeFile(cachePath, 'cached')

      await expect(isAlreadyRemuxed(cacheDir, filePath)).resolves.toBe(true)
    })
  })

  it('resolves differently-cased/separated spellings of the same path to the same cache path', async () => {
    const deps = {
      isLikelyMpegTsStream: async () => true,
      remuxMpegTsToMp4: async (_input: string, outputPath: string) => {
        await writeFile(outputPath, 'remuxed')
        return true
      },
    }

    const upperCaseVariant = filePath.toUpperCase()
    const forwardSlashVariant = filePath.replace(/\\/g, '/')

    const result = await resolvePlayableMediaPath(cacheDir, filePath, deps)
    const resultUpperCase = await resolvePlayableMediaPath(cacheDir, upperCaseVariant, deps)
    const resultForwardSlash = await resolvePlayableMediaPath(cacheDir, forwardSlashVariant, deps)

    expect(resultUpperCase).toBe(result)
    expect(resultForwardSlash).toBe(result)
  })
})
