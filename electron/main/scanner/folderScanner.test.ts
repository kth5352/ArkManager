import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanFolderShallow, scanLibraryRecursive } from './folderScanner'
import { normalizeLibraryPath } from '../database/librariesRepository'

// Node builtin ESM module namespaces aren't configurable, so vi.spyOn can't
// target them directly - vi.mock + vi.hoisted lets individual "error
// tolerance" tests below override stat()/readdir() for one specific path
// while every other call (including all other tests in this file) falls
// through to the real implementation unchanged.
const { statOverride, readdirOverride } = vi.hoisted(() => ({
  statOverride: { impl: null as ((path: string) => Promise<unknown>) | null },
  readdirOverride: { impl: null as ((path: string) => Promise<unknown>) | null },
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    stat: (path: string) => (statOverride.impl ? statOverride.impl(path) : actual.stat(path)),
    readdir: (path: string) =>
      readdirOverride.impl ? readdirOverride.impl(path) : actual.readdir(path),
  }
})

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

  it('resolves a code-less folder to its linked code via a path_code_overrides entry', async () => {
    await mkdir(join(dir, 'MyGame'))
    const overrides = new Map([[normalizeLibraryPath(join(dir, 'MyGame')), 'RJ07777777']])

    const entries = await scanFolderShallow(dir, overrides)
    expect(entries.find((e) => e.name === 'MyGame')?.code).toEqual({
      type: 'RJ',
      value: 'RJ07777777',
    })
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

  it('includes code-less files alongside coded ones (no longer excluded)', async () => {
    await mkdir(join(dir, 'plain-folder'))
    await writeFile(join(dir, 'plain-folder', 'memo.txt'), '')
    await writeFile(join(dir, 'RJ01111.zip'), '')

    const entries = await scanLibraryRecursive(dir)
    const names = entries.map((e) => e.name).sort()
    expect(names).toEqual(['RJ01111.zip', 'memo.txt'])
    expect(entries.find((e) => e.name === 'memo.txt')?.code).toBeNull()
    expect(entries.find((e) => e.name === 'RJ01111.zip')?.code).toEqual({
      type: 'RJ',
      value: 'RJ01111',
    })
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

  it('does not infinitely recurse through a directory junction cycle', async () => {
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'sub', 'RJ01111.zip'), '')
    // Junction inside "sub" that points back at "dir" itself, creating a
    // cycle. Windows directory junctions don't require admin privileges.
    await symlink(dir, join(dir, 'sub', 'loop'), 'junction')

    const entries = await scanLibraryRecursive(dir)
    expect(entries.map((e) => e.name)).toEqual(['RJ01111.zip'])
  })

  it('treats a code-less folder as a coded leaf when a path_code_overrides entry exists', async () => {
    await mkdir(join(dir, 'MyGame'))
    await writeFile(join(dir, 'MyGame', 'game.exe'), '')
    const overrides = new Map([[normalizeLibraryPath(join(dir, 'MyGame')), 'RJ07777777']])

    const entries = await scanLibraryRecursive(dir, overrides)
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('MyGame')
    expect(entries[0].code).toEqual({ type: 'RJ', value: 'RJ07777777' })
  })
})

// Simulates entries/subfolders that become inaccessible mid-scan (permission
// errors, races with deletion) by mocking fs/promises for specific paths -
// a real-filesystem repro of "unstattable between readdir and stat" is not
// reliably reproducible, so this targets the exact failure mode instead.
describe('error tolerance', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlibrary-tolerance-'))
  })

  afterEach(async () => {
    statOverride.impl = null
    readdirOverride.impl = null
    await rm(dir, { recursive: true, force: true })
  })

  it('scanFolderShallow tolerates a child entry that becomes unstattable', async () => {
    await writeFile(join(dir, 'ghost.txt'), '')
    await writeFile(join(dir, 'ok.txt'), '')
    const ghostPath = join(dir, 'ghost.txt')

    const { stat: realStat } =
      await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    statOverride.impl = (path) =>
      path === ghostPath ? Promise.reject(new Error('ENOENT: simulated race')) : realStat(path)

    const entries = await scanFolderShallow(dir)
    expect(entries.map((e) => e.name)).toEqual(['ok.txt'])
  })

  it('scanLibraryRecursive tolerates an unstattable entry without failing sibling entries', async () => {
    await writeFile(join(dir, 'ghost.zip'), '')
    await writeFile(join(dir, 'RJ01111.zip'), '')
    const ghostPath = join(dir, 'ghost.zip')

    const { stat: realStat } =
      await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    statOverride.impl = (path) =>
      path === ghostPath ? Promise.reject(new Error('ENOENT: simulated race')) : realStat(path)

    const entries = await scanLibraryRecursive(dir)
    expect(entries.map((e) => e.name)).toEqual(['RJ01111.zip'])
  })

  it('scanLibraryRecursive tolerates an unreadable subfolder, still returning sibling branches', async () => {
    await mkdir(join(dir, 'branch-a'))
    await mkdir(join(dir, 'branch-b'))
    await writeFile(join(dir, 'branch-a', 'RJ01111.zip'), '')
    await writeFile(join(dir, 'branch-b', 'RJ02222.zip'), '')
    const unreadablePath = join(dir, 'branch-b')

    const { readdir: realReaddir } =
      await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    readdirOverride.impl = (path) =>
      path === unreadablePath
        ? Promise.reject(new Error('EPERM: simulated denial'))
        : realReaddir(path)

    const entries = await scanLibraryRecursive(dir)
    expect(entries.map((e) => e.name)).toEqual(['RJ01111.zip'])
  })
})
