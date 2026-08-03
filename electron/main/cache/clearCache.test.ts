import { describe, it, expect, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clearCache } from './clearCache'

describe('clearCache', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('deletes cached cover images', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-clearcache-'))
    await mkdir(join(dir, 'cache', 'covers'), { recursive: true })
    await writeFile(join(dir, 'cache', 'covers', 'RJ01234567.webp'), 'image-bytes')

    await clearCache(dir, { deleteSaveBackups: false })

    expect(existsSync(join(dir, 'cache', 'covers'))).toBe(false)
  })

  it('deletes cached media thumbnails', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-clearcache-'))
    await mkdir(join(dir, 'cache', 'media-thumbnails'), { recursive: true })
    await writeFile(join(dir, 'cache', 'media-thumbnails', 'abc123.webp'), 'image-bytes')

    await clearCache(dir, { deleteSaveBackups: false })

    expect(existsSync(join(dir, 'cache', 'media-thumbnails'))).toBe(false)
  })

  it('leaves manual media-thumbnail overrides alone', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-clearcache-'))
    await mkdir(join(dir, 'cache', 'media-thumbnail-overrides'), { recursive: true })
    await writeFile(join(dir, 'cache', 'media-thumbnail-overrides', 'abc123.webp'), 'image-bytes')

    await clearCache(dir, { deleteSaveBackups: true })

    expect(existsSync(join(dir, 'cache', 'media-thumbnail-overrides', 'abc123.webp'))).toBe(true)
  })

  it('leaves save backups alone by default', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-clearcache-'))
    await mkdir(join(dir, 'cache', 'covers'), { recursive: true })
    await mkdir(join(dir, 'saves', 'RJ01234567'), { recursive: true })
    await writeFile(join(dir, 'saves', 'RJ01234567', 'save.dat'), 'save-bytes')

    await clearCache(dir, { deleteSaveBackups: false })

    expect(existsSync(join(dir, 'saves', 'RJ01234567', 'save.dat'))).toBe(true)
  })

  it('deletes save backups only when explicitly opted in', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-clearcache-'))
    await mkdir(join(dir, 'saves', 'RJ01234567'), { recursive: true })
    await writeFile(join(dir, 'saves', 'RJ01234567', 'save.dat'), 'save-bytes')

    await clearCache(dir, { deleteSaveBackups: true })

    expect(existsSync(join(dir, 'saves'))).toBe(false)
  })

  it("does not touch anything outside its own cache subdirectories and saves (e.g. Chromium's own Cache_Data)", async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-clearcache-'))
    await mkdir(join(dir, 'cache', 'covers'), { recursive: true })
    await mkdir(join(dir, 'cache', 'Cache_Data'), { recursive: true })
    await writeFile(join(dir, 'cache', 'Cache_Data', 'index'), 'chromium-cache-index')

    await clearCache(dir, { deleteSaveBackups: true })

    expect(existsSync(join(dir, 'cache', 'Cache_Data', 'index'))).toBe(true)
  })

  it('is a no-op (does not throw) when nothing exists yet', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-clearcache-'))

    await expect(clearCache(dir, { deleteSaveBackups: true })).resolves.toBeUndefined()
  })
})
