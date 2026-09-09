import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Real fs/promises for everything except readdir, which is replaced with a
// pass-through spy so specific tests can inject EACCES/EPERM (unreliable to
// produce via real chmod cross-platform, especially on Windows - this app
// is Windows-only) at an exact path while every other readdir call behaves
// like the real filesystem. Vitest can't vi.spyOn() a real ESM module's
// export directly ("Module namespace is not configurable in ESM"), so this
// is done via vi.mock + importOriginal instead, the same pattern this
// project already uses (see restoreSnapshot.test.ts).
const { readdirMock, actualReaddirRef } = vi.hoisted(() => ({
  readdirMock: vi.fn<typeof import('node:fs/promises').readdir>(),
  actualReaddirRef: { current: null as typeof import('node:fs/promises').readdir | null },
}))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  actualReaddirRef.current = actual.readdir
  readdirMock.mockImplementation(actual.readdir)
  return { ...actual, readdir: readdirMock }
})

const { diffSaveFolders } = await import('./diffSaveFolders')
const actualReaddir = actualReaddirRef.current!

describe('diffSaveFolders', () => {
  let leftDir: string
  let rightDir: string

  beforeEach(async () => {
    leftDir = await mkdtemp(join(tmpdir(), 'ark-manager-diff-left-'))
    rightDir = await mkdtemp(join(tmpdir(), 'ark-manager-diff-right-'))
    readdirMock.mockImplementation(actualReaddir)
  })

  afterEach(async () => {
    await rm(leftDir, { recursive: true, force: true })
    await rm(rightDir, { recursive: true, force: true })
  })

  it('reports no differences for identical folders', async () => {
    await writeFile(join(leftDir, 'save1.dat'), 'hello')
    await writeFile(join(rightDir, 'save1.dat'), 'hello')

    expect(await diffSaveFolders(leftDir, rightDir)).toEqual([])
  })

  it('reports a file only in the right folder as added', async () => {
    await writeFile(join(rightDir, 'new.dat'), 'hello')

    expect(await diffSaveFolders(leftDir, rightDir)).toEqual([
      { relativePath: 'new.dat', status: 'added' },
    ])
  })

  it('reports a file only in the left folder as removed', async () => {
    await writeFile(join(leftDir, 'old.dat'), 'hello')

    expect(await diffSaveFolders(leftDir, rightDir)).toEqual([
      { relativePath: 'old.dat', status: 'removed' },
    ])
  })

  it('reports a file with a different size as modified', async () => {
    await writeFile(join(leftDir, 'save1.dat'), 'hello')
    await writeFile(join(rightDir, 'save1.dat'), 'hello world')

    expect(await diffSaveFolders(leftDir, rightDir)).toEqual([
      { relativePath: 'save1.dat', status: 'modified' },
    ])
  })

  it('walks subfolders and reports relative paths with forward slashes', async () => {
    await mkdir(join(rightDir, 'sub'))
    await writeFile(join(rightDir, 'sub', 'nested.dat'), 'hello')

    expect(await diffSaveFolders(leftDir, rightDir)).toEqual([
      { relativePath: 'sub/nested.dat', status: 'added' },
    ])
  })

  it('treats a null left side as empty, reporting every right-side file as added', async () => {
    await writeFile(join(rightDir, 'save1.dat'), 'hello')

    expect(await diffSaveFolders(null, rightDir)).toEqual([
      { relativePath: 'save1.dat', status: 'added' },
    ])
  })

  it('treats a nonexistent left directory the same as an empty one by default', async () => {
    await writeFile(join(rightDir, 'save1.dat'), 'hello')

    expect(await diffSaveFolders(join(leftDir, 'does-not-exist'), rightDir)).toEqual([
      { relativePath: 'save1.dat', status: 'added' },
    ])
  })

  it('rejects an unreadable comparison target instead of reporting all files removed', async () => {
    await writeFile(join(leftDir, 'keep.dat'), 'original')

    await expect(diffSaveFolders(leftDir, join(rightDir, 'missing'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('allows a missing left root when explicitly requested', async () => {
    await writeFile(join(rightDir, 'save1.dat'), 'hello')

    expect(
      await diffSaveFolders(join(leftDir, 'missing'), rightDir, { allowMissingLeftRoot: true })
    ).toEqual([{ relativePath: 'save1.dat', status: 'added' }])
  })

  it('rejects a missing left root when the caller requires it to exist (an explicitly chosen snapshot)', async () => {
    await writeFile(join(rightDir, 'save1.dat'), 'hello')

    await expect(
      diffSaveFolders(join(leftDir, 'missing'), rightDir, { allowMissingLeftRoot: false })
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('allows a missing right root only when explicitly restoring', async () => {
    await writeFile(join(leftDir, 'keep.dat'), 'original')

    await expect(
      diffSaveFolders(leftDir, join(rightDir, 'missing'), {
        allowMissingLeftRoot: false,
        allowMissingRightRoot: true,
      })
    ).resolves.toEqual([{ relativePath: 'keep.dat', status: 'removed' }])
  })

  it('rejects EACCES at the root even when missing roots are allowed', async () => {
    const target = join(rightDir, 'protected')
    readdirMock.mockImplementation(async (...args) => {
      const path = args[0] as string
      if (path === target) {
        const error = new Error('simulated: permission denied') as NodeJS.ErrnoException
        error.code = 'EACCES'
        throw error
      }
      return actualReaddir(...args)
    })

    await expect(
      diffSaveFolders(leftDir, target, { allowMissingRightRoot: true })
    ).rejects.toMatchObject({ code: 'EACCES' })
  })

  it('rejects a readdir failure on a nested subdirectory even when the root is readable', async () => {
    const nested = join(rightDir, 'sub')
    await mkdir(nested)
    await writeFile(join(rightDir, 'top.dat'), 'hello')
    readdirMock.mockImplementation(async (...args) => {
      const path = args[0] as string
      if (path === nested) {
        const error = new Error('simulated: subtree lost mid-scan') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      }
      return actualReaddir(...args)
    })

    // The nested failure must propagate even though the root itself is
    // fine and allowMissingRightRoot is true - that flag only ever applies
    // to the walk's OWN starting root, never a subdirectory found partway
    // through.
    await expect(
      diffSaveFolders(leftDir, rightDir, { allowMissingRightRoot: true })
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
