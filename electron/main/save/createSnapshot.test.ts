import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSnapshot, timestampToDirName } from './createSnapshot'

describe('timestampToDirName', () => {
  it('replaces colons and dots so the result is a safe path segment', () => {
    const dirName = timestampToDirName(new Date('2026-08-01T12:34:56.789Z'))
    expect(dirName).toBe('2026-08-01T12-34-56-789Z')
  })
})

describe('createSnapshot', () => {
  let sourceDir: string
  let backupRootDir: string

  beforeEach(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), 'ark-manager-snapshot-src-'))
    backupRootDir = await mkdtemp(join(tmpdir(), 'ark-manager-snapshot-root-'))
  })

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true })
    await rm(backupRootDir, { recursive: true, force: true })
  })

  it('copies the source folder into a new timestamped subfolder and returns its name', async () => {
    await writeFile(join(sourceDir, 'save1.dat'), 'hello')

    const timestamp = await createSnapshot(sourceDir, backupRootDir)

    expect(await readFile(join(backupRootDir, timestamp, 'save1.dat'), 'utf-8')).toBe('hello')
  })

  it('creates a distinct subfolder on each call rather than overwriting the last one', async () => {
    await writeFile(join(sourceDir, 'save1.dat'), 'first')
    const first = await createSnapshot(sourceDir, backupRootDir)

    await writeFile(join(sourceDir, 'save1.dat'), 'second')
    const second = await createSnapshot(sourceDir, backupRootDir)

    expect(first).not.toBe(second)
    expect(await readFile(join(backupRootDir, first, 'save1.dat'), 'utf-8')).toBe('first')
    expect(await readFile(join(backupRootDir, second, 'save1.dat'), 'utf-8')).toBe('second')
  })
})
