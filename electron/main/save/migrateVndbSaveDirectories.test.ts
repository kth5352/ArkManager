import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateVndbSaveDirectories } from './migrateVndbSaveDirectories'

describe('migrateVndbSaveDirectories', () => {
  let savesRoot: string

  beforeEach(async () => {
    savesRoot = await mkdtemp(join(tmpdir(), 'ark-manager-vndb-saves-'))
  })

  afterEach(async () => {
    await rm(savesRoot, { recursive: true, force: true })
  })

  it('copies an exact legacy VN snapshot directory and retains the source', async () => {
    const snapshot = '2026-01-01T00-00-00-000Z'
    await mkdir(join(savesRoot, 'VN17', snapshot), { recursive: true })
    await writeFile(join(savesRoot, 'VN17', snapshot, 'save.dat'), 'legacy')

    await migrateVndbSaveDirectories(savesRoot)

    expect(await readFile(join(savesRoot, 'VNV17', snapshot, 'save.dat'), 'utf-8')).toBe('legacy')
    expect(await readFile(join(savesRoot, 'VN17', snapshot, 'save.dat'), 'utf-8')).toBe('legacy')
  })

  it('copies an exact legacy VR snapshot directory', async () => {
    await mkdir(join(savesRoot, 'VR20', 'snapshot'), { recursive: true })
    await writeFile(join(savesRoot, 'VR20', 'snapshot', 'save.dat'), 'legacy-vr')

    await migrateVndbSaveDirectories(savesRoot)

    expect(await readFile(join(savesRoot, 'VNR20', 'snapshot', 'save.dat'), 'utf-8')).toBe('legacy-vr')
  })

  it('leaves an existing canonical destination byte-for-byte unchanged', async () => {
    await mkdir(join(savesRoot, 'VN17', 'legacy-snapshot'), { recursive: true })
    await writeFile(join(savesRoot, 'VN17', 'legacy-snapshot', 'save.dat'), 'legacy')
    await mkdir(join(savesRoot, 'VNV17', 'canonical-snapshot'), { recursive: true })
    await writeFile(join(savesRoot, 'VNV17', 'canonical-snapshot', 'save.dat'), 'canonical')

    await migrateVndbSaveDirectories(savesRoot)

    expect(await readFile(join(savesRoot, 'VNV17', 'canonical-snapshot', 'save.dat'), 'utf-8')).toBe(
      'canonical'
    )
    await expect(readFile(join(savesRoot, 'VNV17', 'legacy-snapshot', 'save.dat'))).rejects.toThrow()
  })

  it('ignores non-exact legacy names, canonical names, and unrelated directories', async () => {
    await mkdir(join(savesRoot, 'VN1junk', 'snapshot'), { recursive: true })
    await mkdir(join(savesRoot, 'VNV17', 'snapshot'), { recursive: true })
    await mkdir(join(savesRoot, 'RJ123', 'snapshot'), { recursive: true })

    await migrateVndbSaveDirectories(savesRoot)

    expect((await readdir(savesRoot)).sort()).toEqual(['RJ123', 'VN1junk', 'VNV17'])
  })

  it('is idempotent when run more than once', async () => {
    await mkdir(join(savesRoot, 'VN17', 'snapshot'), { recursive: true })
    await writeFile(join(savesRoot, 'VN17', 'snapshot', 'save.dat'), 'legacy')

    await migrateVndbSaveDirectories(savesRoot)
    const directoriesAfterFirstRun = (await readdir(savesRoot)).sort()
    await migrateVndbSaveDirectories(savesRoot)

    expect((await readdir(savesRoot)).sort()).toEqual(directoriesAfterFirstRun)
    expect(directoriesAfterFirstRun).toEqual(['VN17', 'VNV17'])
  })

  it('returns normally when the saves root does not exist', async () => {
    await rm(savesRoot, { recursive: true, force: true })

    await expect(migrateVndbSaveDirectories(savesRoot)).resolves.toBeUndefined()
  })
})
