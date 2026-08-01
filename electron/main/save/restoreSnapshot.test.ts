import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { restoreSnapshot } from './restoreSnapshot'

describe('restoreSnapshot', () => {
  let backupRootDir: string
  let targetDir: string

  beforeEach(async () => {
    backupRootDir = await mkdtemp(join(tmpdir(), 'ark-manager-restore-root-'))
    targetDir = await mkdtemp(join(tmpdir(), 'ark-manager-restore-target-'))
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
})
