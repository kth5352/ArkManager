import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Real fs/promises for everything except rename/cp, which are replaced with
// pass-through spies so a single test can simulate an EXDEV (cross-volume)
// rename followed by a failing cp - Vitest can't vi.spyOn() a real ESM
// module's export directly ("Module namespace is not configurable in ESM"),
// so this is done via vi.mock + importOriginal instead, the same pattern
// this project already uses in restoreSnapshot.test.ts.
const { renameMock, cpMock, actualRenameRef, actualCpRef } = vi.hoisted(() => ({
  renameMock: vi.fn<typeof import('node:fs/promises').rename>(),
  cpMock: vi.fn<typeof import('node:fs/promises').cp>(),
  actualRenameRef: { current: null as typeof import('node:fs/promises').rename | null },
  actualCpRef: { current: null as typeof import('node:fs/promises').cp | null },
}))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  actualRenameRef.current = actual.rename
  actualCpRef.current = actual.cp
  renameMock.mockImplementation(actual.rename)
  cpMock.mockImplementation(actual.cp)
  return { ...actual, rename: renameMock, cp: cpMock }
})

const { moveEntries } = await import('./moveEntries')
const actualRename = actualRenameRef.current!
const actualCp = actualCpRef.current!

describe('moveEntries', () => {
  let dir: string
  let sourceDir: string
  let destDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-move-'))
    sourceDir = join(dir, 'source')
    destDir = join(dir, 'dest')
    await mkdir(sourceDir)
    await mkdir(destDir)
    // Reset to the real implementations before each test - only the test
    // that specifically exercises the EXDEV fallback overrides these.
    renameMock.mockImplementation(actualRename)
    cpMock.mockImplementation(actualCp)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('moves a file to the destination directory', async () => {
    const filePath = join(sourceDir, 'a.zip')
    await writeFile(filePath, 'content')

    const results = await moveEntries([filePath], destDir)

    expect(results).toEqual([{ path: filePath, success: true, newPath: join(destDir, 'a.zip') }])
    expect(await readdir(sourceDir)).toEqual([])
    expect(await readFile(join(destDir, 'a.zip'), 'utf-8')).toBe('content')
  })

  it('moves a folder (with its contents) to the destination directory', async () => {
    const folderPath = join(sourceDir, 'MyGame')
    await mkdir(folderPath)
    await writeFile(join(folderPath, 'game.exe'), 'binary')

    const results = await moveEntries([folderPath], destDir)

    expect(results[0]).toMatchObject({ success: true, newPath: join(destDir, 'MyGame') })
    expect(await readdir(sourceDir)).toEqual([])
    expect(await readdir(join(destDir, 'MyGame'))).toEqual(['game.exe'])
  })

  it('rejects a move that would collide with an existing entry at the destination', async () => {
    const filePath = join(sourceDir, 'a.zip')
    await writeFile(filePath, 'source content')
    await writeFile(join(destDir, 'a.zip'), 'existing content')

    const results = await moveEntries([filePath], destDir)

    expect(results).toEqual([
      {
        path: filePath,
        success: false,
        error: '대상 위치에 같은 이름의 파일/폴더가 이미 있습니다.',
      },
    ])
    // Neither side was touched.
    expect(await readFile(filePath, 'utf-8')).toBe('source content')
    expect(await readFile(join(destDir, 'a.zip'), 'utf-8')).toBe('existing content')
  })

  it('processes a batch, continuing past a per-item failure', async () => {
    const pathA = join(sourceDir, 'a.zip')
    const pathB = join(sourceDir, 'b.zip')
    await writeFile(pathA, '')
    await writeFile(pathB, '')
    await writeFile(join(destDir, 'a.zip'), 'taken')

    const results = await moveEntries([pathA, pathB], destDir)

    expect(results.map((r) => r.success)).toEqual([false, true])
    expect(await readdir(sourceDir)).toEqual(['a.zip'])
    expect((await readdir(destDir)).sort()).toEqual(['a.zip', 'b.zip'])
  })

  it('is a no-op when the destination is the same folder the entry is already in', async () => {
    const filePath = join(sourceDir, 'a.zip')
    await writeFile(filePath, 'content')

    const results = await moveEntries([filePath], sourceDir)

    expect(results).toEqual([{ path: filePath, success: true, newPath: filePath }])
    expect(await readFile(filePath, 'utf-8')).toBe('content')
  })

  it('cleans up a partial destination copy if the cross-volume fallback fails partway through', async () => {
    const filePath = join(sourceDir, 'a.zip')
    await writeFile(filePath, 'content')
    const destPath = join(destDir, 'a.zip')

    renameMock.mockImplementation(async () => {
      const error = new Error('simulated: cross-volume move') as NodeJS.ErrnoException
      error.code = 'EXDEV'
      throw error
    })
    cpMock.mockImplementation(async () => {
      // Reproduces what a real disk-full-mid-copy or interrupted transfer
      // leaves behind: SOME content already written at the destination,
      // then a failure - cp() across volumes is not atomic the way
      // rename() is within one.
      await writeFile(destPath, 'partial')
      throw new Error('simulated: disk full mid-copy')
    })

    const results = await moveEntries([filePath], destDir)

    expect(results[0]).toMatchObject({ success: false, error: expect.stringContaining('disk full') })
    // The source must survive - rm(sourcePath) never runs when cp() throws.
    expect(await readFile(filePath, 'utf-8')).toBe('content')
    // The partial copy must be cleaned up - left in place, it would
    // permanently block every future retry of this same move via the
    // "already exists" collision check at the top of moveOne.
    await expect(access(destPath)).rejects.toThrow()
  })
})
