import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanFolderShallow, scanLibraryRecursive } from './folderScanner'

describe('scanFolderShallow', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlibrary-shallow-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('lists direct children regardless of code recognition, like a real file explorer', async () => {
    await mkdir(join(dir, '하위폴더1'))
    await writeFile(join(dir, 'RJ01111.zip'), '')
    await writeFile(join(dir, 'memo.txt'), '')

    const entries = await scanFolderShallow(dir)
    const names = entries.map((e) => e.name).sort()
    expect(names).toEqual(['RJ01111.zip', 'memo.txt', '하위폴더1'])
  })

  it('marks folders and files with the correct kind', async () => {
    await mkdir(join(dir, 'a-folder'))
    await writeFile(join(dir, 'a-file.txt'), '')

    const entries = await scanFolderShallow(dir)
    expect(entries.find((e) => e.name === 'a-folder')?.kind).toBe('folder')
    expect(entries.find((e) => e.name === 'a-file.txt')?.kind).toBe('file')
  })

  it('attaches a recognized code to matching entries and null to others', async () => {
    await writeFile(join(dir, 'RJ01111.zip'), '')
    await writeFile(join(dir, 'memo.txt'), '')

    const entries = await scanFolderShallow(dir)
    expect(entries.find((e) => e.name === 'RJ01111.zip')?.code).toEqual({
      type: 'RJ',
      value: 'RJ01111',
    })
    expect(entries.find((e) => e.name === 'memo.txt')?.code).toBeNull()
  })

  it('does not descend into subfolders', async () => {
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'sub', 'RJ99999.zip'), '')

    const entries = await scanFolderShallow(dir)
    expect(entries.map((e) => e.name)).toEqual(['sub'])
  })
})

describe('scanLibraryRecursive', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlibrary-recursive-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('finds a coded entry nested several levels deep', async () => {
    await mkdir(join(dir, 'a', 'b', 'c'), { recursive: true })
    await writeFile(join(dir, 'a', 'b', 'c', 'RJ01234567.zip'), '')

    const entries = await scanLibraryRecursive(dir)
    expect(entries).toHaveLength(1)
    expect(entries[0].code).toEqual({ type: 'RJ', value: 'RJ01234567' })
    expect(entries[0].path).toBe(join(dir, 'a', 'b', 'c', 'RJ01234567.zip'))
  })

  it('excludes entries without a recognized code', async () => {
    await mkdir(join(dir, 'plain-folder'))
    await writeFile(join(dir, 'plain-folder', 'memo.txt'), '')
    await writeFile(join(dir, 'RJ01111.zip'), '')

    const entries = await scanLibraryRecursive(dir)
    expect(entries.map((e) => e.name)).toEqual(['RJ01111.zip'])
  })

  it('finds multiple coded entries across different branches', async () => {
    await mkdir(join(dir, 'branch-a'))
    await mkdir(join(dir, 'branch-b'))
    await writeFile(join(dir, 'branch-a', 'RJ01111.zip'), '')
    await writeFile(join(dir, 'branch-b', 'VJ02222'), '')

    const entries = await scanLibraryRecursive(dir)
    expect(entries.map((e) => e.name).sort()).toEqual(['RJ01111.zip', 'VJ02222'])
  })

  it('does not recurse into a folder that is itself a recognized game (treats it as a leaf)', async () => {
    await mkdir(join(dir, 'RJ01111'))
    await writeFile(join(dir, 'RJ01111', 'cover.jpg'), '')
    await writeFile(join(dir, 'RJ01111', 'data.pak'), '')

    const entries = await scanLibraryRecursive(dir)
    expect(entries.map((e) => e.name)).toEqual(['RJ01111'])
  })
})
