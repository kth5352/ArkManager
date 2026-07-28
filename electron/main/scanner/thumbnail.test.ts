import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findThumbnailPath } from './thumbnail'

describe('findThumbnailPath', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlibrary-thumb-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns null for an empty folder', async () => {
    expect(await findThumbnailPath(dir)).toBeNull()
  })

  it('prefers a file named "cover" over other images', async () => {
    await writeFile(join(dir, 'aaa_screenshot.png'), '')
    await writeFile(join(dir, 'cover.jpg'), '')
    expect(await findThumbnailPath(dir)).toBe(join(dir, 'cover.jpg'))
  })

  it('prefers "folder" or "thumbnail" when there is no "cover"', async () => {
    await writeFile(join(dir, 'aaa_screenshot.png'), '')
    await writeFile(join(dir, 'thumbnail.webp'), '')
    expect(await findThumbnailPath(dir)).toBe(join(dir, 'thumbnail.webp'))
  })

  it('falls back to the alphabetically-first image when no preferred name exists', async () => {
    await writeFile(join(dir, 'zzz.png'), '')
    await writeFile(join(dir, 'aaa.jpg'), '')
    expect(await findThumbnailPath(dir)).toBe(join(dir, 'aaa.jpg'))
  })

  it('ignores non-image files', async () => {
    await writeFile(join(dir, 'data.pak'), '')
    await writeFile(join(dir, 'readme.txt'), '')
    expect(await findThumbnailPath(dir)).toBeNull()
  })

  it('returns null for a path that does not exist', async () => {
    expect(await findThumbnailPath(join(dir, 'nope'))).toBeNull()
  })
})
