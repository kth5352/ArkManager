import { describe, it, expect, afterEach } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateUserDataFolder } from './migrateUserDataFolder'

describe('migrateUserDataFolder', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('moves the old db and its WAL/SHM sidecars, renamed to the new filename', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-migrate-'))
    const oldPath = join(dir, 'dlibrary')
    const newPath = join(dir, 'ark-manager')
    await mkdir(oldPath, { recursive: true })
    await mkdir(newPath, { recursive: true }) // Electron/Chromium already created this
    await writeFile(join(oldPath, 'dlibrary.db'), 'main-db-content')
    await writeFile(join(oldPath, 'dlibrary.db-wal'), 'wal-content')
    await writeFile(join(oldPath, 'dlibrary.db-shm'), 'shm-content')

    await migrateUserDataFolder(oldPath, newPath)

    expect(await readFile(join(newPath, 'ark-manager.db'), 'utf-8')).toBe('main-db-content')
    expect(await readFile(join(newPath, 'ark-manager.db-wal'), 'utf-8')).toBe('wal-content')
    expect(await readFile(join(newPath, 'ark-manager.db-shm'), 'utf-8')).toBe('shm-content')
    expect(existsSync(join(oldPath, 'dlibrary.db'))).toBe(false)
  })

  it('moves other app-owned entries (e.g. the cover-image cache) across unrenamed', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-migrate-'))
    const oldPath = join(dir, 'dlibrary')
    const newPath = join(dir, 'ark-manager')
    await mkdir(join(oldPath, 'cache', 'covers'), { recursive: true })
    await mkdir(newPath, { recursive: true })
    await writeFile(join(oldPath, 'dlibrary.db'), 'main-db-content')
    await writeFile(join(oldPath, 'cache', 'covers', 'RJ01234567.webp'), 'image-bytes')

    await migrateUserDataFolder(oldPath, newPath)

    expect(await readFile(join(newPath, 'cache', 'covers', 'RJ01234567.webp'), 'utf-8')).toBe(
      'image-bytes'
    )
  })

  it('merges into a directory that already exists at the destination instead of skipping it', async () => {
    // Mirrors a real collision on Windows: cacheCoverImage.ts writes to
    // userData/cache/covers, but Chromium's own "Cache" folder (created
    // fresh before this migration ever runs) occupies the same physical
    // directory on a case-insensitive filesystem - "cache" already exists
    // at the destination by the time migration runs, with Chromium's own
    // files already inside it, but the old covers/ subfolder is still
    // genuinely missing and must be merged in rather than abandoned.
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-migrate-'))
    const oldPath = join(dir, 'dlibrary')
    const newPath = join(dir, 'ark-manager')
    await mkdir(join(oldPath, 'cache', 'covers'), { recursive: true })
    await writeFile(join(oldPath, 'dlibrary.db'), 'main-db-content')
    await writeFile(join(oldPath, 'cache', 'covers', 'RJ01234567.webp'), 'image-bytes')
    await mkdir(join(newPath, 'cache', 'Cache_Data'), { recursive: true })
    await writeFile(join(newPath, 'cache', 'Cache_Data', 'index'), 'chromium-cache-index')

    await migrateUserDataFolder(oldPath, newPath)

    expect(await readFile(join(newPath, 'cache', 'covers', 'RJ01234567.webp'), 'utf-8')).toBe(
      'image-bytes'
    )
    expect(await readFile(join(newPath, 'cache', 'Cache_Data', 'index'), 'utf-8')).toBe(
      'chromium-cache-index'
    )
  })

  it('is a no-op when there is nothing to migrate (fresh install)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-migrate-'))
    const oldPath = join(dir, 'dlibrary') // never created
    const newPath = join(dir, 'ark-manager')
    await mkdir(newPath, { recursive: true })

    await expect(migrateUserDataFolder(oldPath, newPath)).resolves.toBeUndefined()
    expect(existsSync(join(newPath, 'ark-manager.db'))).toBe(false)
  })

  it('is a no-op when the new db already exists (already migrated)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-migrate-'))
    const oldPath = join(dir, 'dlibrary')
    const newPath = join(dir, 'ark-manager')
    await mkdir(oldPath, { recursive: true })
    await mkdir(newPath, { recursive: true })
    await writeFile(join(oldPath, 'dlibrary.db'), 'stale-old-content')
    await writeFile(join(newPath, 'ark-manager.db'), 'current-content')

    await migrateUserDataFolder(oldPath, newPath)

    expect(await readFile(join(newPath, 'ark-manager.db'), 'utf-8')).toBe('current-content')
  })

  it('is a no-op when oldPath and newPath are the same', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-migrate-'))
    const samePath = join(dir, 'ark-manager')
    await mkdir(samePath, { recursive: true })
    await writeFile(join(samePath, 'dlibrary.db'), 'content')

    await expect(migrateUserDataFolder(samePath, samePath)).resolves.toBeUndefined()
    expect(existsSync(join(samePath, 'dlibrary.db'))).toBe(true)
  })

  it('does not overwrite a same-named entry already present at the destination', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-migrate-'))
    const oldPath = join(dir, 'dlibrary')
    const newPath = join(dir, 'ark-manager')
    await mkdir(oldPath, { recursive: true })
    await mkdir(newPath, { recursive: true })
    await writeFile(join(oldPath, 'dlibrary.db'), 'old-main-db')
    await writeFile(join(oldPath, 'settings.json'), 'old-settings')
    await writeFile(join(newPath, 'settings.json'), 'new-settings-already-there')

    await migrateUserDataFolder(oldPath, newPath)

    expect(await readFile(join(newPath, 'settings.json'), 'utf-8')).toBe(
      'new-settings-already-there'
    )
    expect(await readFile(join(newPath, 'ark-manager.db'), 'utf-8')).toBe('old-main-db')
  })
})
