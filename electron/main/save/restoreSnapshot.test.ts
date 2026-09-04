import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Real fs/promises for every export except rename, which is replaced with a
// pass-through spy so a single test can make just ONE specific rename() call
// fail (see that test's own comment) while every other fs operation in
// restoreSnapshot.ts - including its OTHER rename() calls - behaves exactly
// like the real filesystem. Vitest can't vi.spyOn() a real ESM module's
// export directly ("Module namespace is not configurable in ESM"), so this
// is done via vi.mock + importOriginal instead, the same pattern this
// project already uses elsewhere (see mediaThumbnailHandlers.test.ts).
const { renameMock, actualRenameRef } = vi.hoisted(() => ({
  renameMock: vi.fn<typeof import('node:fs/promises').rename>(),
  actualRenameRef: { current: null as typeof import('node:fs/promises').rename | null },
}))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  actualRenameRef.current = actual.rename
  renameMock.mockImplementation(actual.rename)
  return { ...actual, rename: renameMock }
})

const { restoreSnapshot } = await import('./restoreSnapshot')
const actualRename = actualRenameRef.current!

describe('restoreSnapshot', () => {
  let backupRootDir: string
  let targetDir: string

  beforeEach(async () => {
    backupRootDir = await mkdtemp(join(tmpdir(), 'ark-manager-restore-root-'))
    targetDir = await mkdtemp(join(tmpdir(), 'ark-manager-restore-target-'))
    // Reset to the real implementation before each test - only the one test
    // below that specifically exercises a rename failure overrides this.
    renameMock.mockImplementation(actualRename)
  })

  afterEach(async () => {
    await rm(backupRootDir, { recursive: true, force: true })
    await rm(targetDir, { recursive: true, force: true })
  })

  it('copies the snapshot contents into the target directory', async () => {
    await mkdir(join(backupRootDir, 'snap1'))
    await writeFile(join(backupRootDir, 'snap1', 'save1.dat'), 'restored content')

    await restoreSnapshot(backupRootDir, 'snap1', targetDir)

    expect(await readFile(join(targetDir, 'save1.dat'), 'utf-8')).toBe('restored content')
  })

  it('removes a target file that is absent from the snapshot, matching the previewed diff', async () => {
    await mkdir(join(backupRootDir, 'snap1'))
    await writeFile(join(backupRootDir, 'snap1', 'save1.dat'), 'from snapshot')
    await writeFile(join(targetDir, 'newer-save.dat'), 'created after the snapshot')

    await restoreSnapshot(backupRootDir, 'snap1', targetDir)

    const filesAfter = await readdir(targetDir)
    expect(filesAfter).toEqual(['save1.dat'])
  })

  it('leaves the live save folder untouched when the snapshot does not exist', async () => {
    await writeFile(join(targetDir, 'existing-save.dat'), 'must survive a bad restore')

    await expect(restoreSnapshot(backupRootDir, 'does-not-exist', targetDir)).rejects.toThrow()

    expect(await readFile(join(targetDir, 'existing-save.dat'), 'utf-8')).toBe(
      'must survive a bad restore'
    )
  })

  it('restores the original save if the final swap fails, instead of leaving it deleted', async () => {
    await mkdir(join(backupRootDir, 'snap1'))
    await writeFile(join(backupRootDir, 'snap1', 'save1.dat'), 'from snapshot')
    await writeFile(join(targetDir, 'existing-save.dat'), 'must survive a failed swap')

    // Lets the FIRST rename (targetDir -> its .ark-manager-previous backup)
    // through untouched, then fails only the SECOND one (the new content ->
    // targetDir) - the one step the old delete-then-recopy implementation
    // had no recovery from, since it had already deleted targetDir by then.
    let renameCallCount = 0
    renameMock.mockImplementation(async (...args) => {
      renameCallCount += 1
      if (renameCallCount === 2) throw new Error('simulated: target locked by another process')
      return actualRename(...(args as Parameters<typeof actualRename>))
    })

    await expect(restoreSnapshot(backupRootDir, 'snap1', targetDir)).rejects.toThrow(/simulated/)

    // The original save must still be there, not an empty/missing
    // targetDir - this is exactly the data-loss window the fix closes.
    expect(await readFile(join(targetDir, 'existing-save.dat'), 'utf-8')).toBe(
      'must survive a failed swap'
    )
  })
})
