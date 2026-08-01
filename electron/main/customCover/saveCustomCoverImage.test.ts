import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { saveCustomCoverImage } from './saveCustomCoverImage'

describe('saveCustomCoverImage', () => {
  let cacheDir: string
  let png: Buffer

  beforeEach(async () => {
    png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .png()
      .toBuffer()
    cacheDir = await mkdtemp(join(tmpdir(), 'ark-manager-custom-cover-'))
  })

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true })
  })

  it('converts the image to webp and saves it under cacheDir/key.webp', async () => {
    const savedPath = await saveCustomCoverImage(cacheDir, 'd:\\games\\some-folder', png)
    expect(await readFile(savedPath).then((b) => b.subarray(8, 12).toString('ascii'))).toBe('WEBP')
  })

  it('creates cacheDir if it does not exist', async () => {
    const nonExistentDir = join(cacheDir, 'nested', 'cache', 'dir')
    const savedPath = await saveCustomCoverImage(nonExistentDir, 'RJ01234567', png)
    expect(savedPath).toBe(join(nonExistentDir, 'RJ01234567.webp'))
  })

  it('hashes a key containing path-traversal segments instead of writing outside cacheDir', async () => {
    const savedPath = await saveCustomCoverImage(cacheDir, '../../evil', png)
    expect(savedPath.startsWith(cacheDir)).toBe(true)
    expect(savedPath).not.toContain('evil')
  })
})
