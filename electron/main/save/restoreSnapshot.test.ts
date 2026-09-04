import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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
    // Reset to the real implementation before each test - only the tests
    // that specifically exercise a rename failure override this.
    renameMock.mockImplementation(actualRename)
  })

  afterEach(async () => {
    await rm(backupRootDir, { recursive: true, force: true })
    await rm(targetDir, { recursive: true, force: true })
    // The two sibling directories restoreSnapshot uses for its atomic swap
    // - a test that leaves one behind (a failure test that doesn't clean up
    // after itself, or a genuine leak in the implementation) shouldn't leak
    // into whichever test happens to run next.
    await rm(`${targetDir}.ark-manager-restoring`, { recursive: true, force: true })
    await rm(`${targetDir}.ark-manager-previous`, { recursive: true, force: true })
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

  it('cleans up its own sibling directories after a successful restore', async () => {
    await mkdir(join(backupRootDir, 'snap1'))
    await writeFile(join(backupRootDir, 'snap1', 'save1.dat'), 'from snapshot')
    await writeFile(join(targetDir, 'existing-save.dat'), 'will be replaced')

    await restoreSnapshot(backupRootDir, 'snap1', targetDir)

    await expect(access(`${targetDir}.ark-manager-restoring`)).rejects.toThrow()
    await expect(access(`${targetDir}.ark-manager-previous`)).rejects.toThrow()
  })

  it('restores the original save if the final swap fails, instead of leaving it deleted', async () => {
    await mkdir(join(backupRootDir, 'snap1'))
    await writeFile(join(backupRootDir, 'snap1', 'save1.dat'), 'from snapshot')
    await writeFile(join(targetDir, 'existing-save.dat'), 'must survive a failed swap')

    // Matches on the actual arguments, not call order - fails only the
    // specific rename(newDir, targetDir) call (the one step that can still
    // fail after targetDir has already been touched), not whichever rename
    // happens to be second by coincidence. A future code change that adds
    // or reorders a rename() call can't silently make this test exercise
    // the wrong failure point without also making it obviously not compile
    // against a changed call shape here.
    const newDir = `${targetDir}.ark-manager-restoring`
    renameMock.mockImplementation(async (...args) => {
      const [from, to] = args as [string, string]
      if (from === newDir && to === targetDir) {
        throw new Error('simulated: target locked by another process')
      }
      return actualRename(...args)
    })

    await expect(restoreSnapshot(backupRootDir, 'snap1', targetDir)).rejects.toThrow(/simulated/)

    // The original save must still be there, not an empty/missing
    // targetDir - this is exactly the data-loss window the fix closes.
    expect(await readFile(join(targetDir, 'existing-save.dat'), 'utf-8')).toBe(
      'must survive a failed swap'
    )
    // Both sibling directories must be gone too - previousDir because
    // recovery succeeded (its content is back in targetDir), newDir because
    // it's just dead weight once recovery succeeds - a leak here would leave
    // a full duplicate of the snapshot sitting next to the save folder
    // forever.
    await expect(access(newDir)).rejects.toThrow()
    await expect(access(`${targetDir}.ark-manager-previous`)).rejects.toThrow()
  })

  it('surfaces both failures and preserves the original save path if recovery ALSO fails', async () => {
    await mkdir(join(backupRootDir, 'snap1'))
    await writeFile(join(backupRootDir, 'snap1', 'save1.dat'), 'from snapshot')
    await writeFile(join(targetDir, 'existing-save.dat'), 'must survive a double failure')

    // Simulates something else (an autosave, cloud sync, an AV scanner)
    // touching the save folder at exactly the wrong instant - both the
    // swap-in rename AND the recovery rename that's supposed to undo it
    // fail. This is the scenario a real double-failure review found: with
    // only the swap-in failure guarded, the original save could end up
    // permanently stranded (and then deleted by a naive "clean up leftover
    // state" on the NEXT restore attempt) with no error naming where it is.
    const newDir = `${targetDir}.ark-manager-restoring`
    const previousDir = `${targetDir}.ark-manager-previous`
    renameMock.mockImplementation(async (...args) => {
      const [from, to] = args as [string, string]
      if (from === newDir && to === targetDir) {
        throw new Error('simulated swap failure')
      }
      if (from === previousDir && to === targetDir) {
        throw new Error('simulated recovery failure')
      }
      return actualRename(...args)
    })

    const error = await restoreSnapshot(backupRootDir, 'snap1', targetDir).catch(
      (caught: unknown) => caught
    )

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(previousDir)
    expect((error as Error).message).toContain('simulated swap failure')
    expect((error as Error).message).toContain('simulated recovery failure')
    // cause is the most immediately-caught error (the recovery failure) -
    // the swap failure's own message is folded into the text above instead
    // of being lost.
    expect((error as Error).cause).toBeInstanceOf(Error)
    expect((error as Error & { cause: Error }).cause.message).toBe('simulated recovery failure')

    // The original save is genuinely still readable - just relocated to
    // previousDir, not lost.
    expect(await readFile(join(previousDir, 'existing-save.dat'), 'utf-8')).toBe(
      'must survive a double failure'
    )
  })

  it('refuses to proceed (rather than silently deleting a stranded original) when a previous restore left previousDir behind', async () => {
    const previousDir = `${targetDir}.ark-manager-previous`
    await mkdir(previousDir)
    await writeFile(join(previousDir, 'stranded-original.dat'), 'the user\'s real save')
    await mkdir(join(backupRootDir, 'snap1'))
    await writeFile(join(backupRootDir, 'snap1', 'save1.dat'), 'from snapshot')

    await expect(restoreSnapshot(backupRootDir, 'snap1', targetDir)).rejects.toThrow(
      /previous restore did not finish cleanly/i
    )

    // Must not have touched the leftover data while refusing.
    expect(await readFile(join(previousDir, 'stranded-original.dat'), 'utf-8')).toBe(
      "the user's real save"
    )
  })
})
