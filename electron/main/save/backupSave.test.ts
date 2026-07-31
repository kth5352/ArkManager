import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backupSave } from './backupSave'

describe('backupSave', () => {
  let sourceDir: string
  let backupDir: string

  beforeEach(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), 'ark-manager-save-src-'))
    backupDir = join(await mkdtemp(join(tmpdir(), 'ark-manager-save-dst-')), 'nested')
  })

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true })
    await rm(backupDir, { recursive: true, force: true })
  })

  it('copies files and subfolders from source to backup, creating the backup dir', async () => {
    await mkdir(join(sourceDir, 'sub'))
    await writeFile(join(sourceDir, 'save1.dat'), 'hello')
    await writeFile(join(sourceDir, 'sub', 'save2.dat'), 'world')

    await backupSave(sourceDir, backupDir)

    expect(await readFile(join(backupDir, 'save1.dat'), 'utf-8')).toBe('hello')
    expect(await readFile(join(backupDir, 'sub', 'save2.dat'), 'utf-8')).toBe('world')
  })

  it('overwrites an existing backup on repeated calls', async () => {
    await writeFile(join(sourceDir, 'save1.dat'), 'first')
    await backupSave(sourceDir, backupDir)

    await writeFile(join(sourceDir, 'save1.dat'), 'second')
    await backupSave(sourceDir, backupDir)

    expect(await readFile(join(backupDir, 'save1.dat'), 'utf-8')).toBe('second')
  })
})
