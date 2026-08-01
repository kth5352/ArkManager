import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listSnapshots } from './listSnapshots'

describe('listSnapshots', () => {
  let backupRootDir: string

  beforeEach(async () => {
    backupRootDir = await mkdtemp(join(tmpdir(), 'ark-manager-list-snapshots-'))
  })

  afterEach(async () => {
    await rm(backupRootDir, { recursive: true, force: true })
  })

  it('returns an empty list when the backup root does not exist', async () => {
    expect(await listSnapshots(join(backupRootDir, 'does-not-exist'))).toEqual([])
  })

  it('returns an empty list when the backup root has no snapshots yet', async () => {
    expect(await listSnapshots(backupRootDir)).toEqual([])
  })

  it('reports file count and total size for a snapshot', async () => {
    await mkdir(join(backupRootDir, '2026-01-01T00-00-00-000Z'))
    await writeFile(join(backupRootDir, '2026-01-01T00-00-00-000Z', 'save1.dat'), 'hello')
    await writeFile(join(backupRootDir, '2026-01-01T00-00-00-000Z', 'save2.dat'), 'hi')

    expect(await listSnapshots(backupRootDir)).toEqual([
      { timestamp: '2026-01-01T00-00-00-000Z', fileCount: 2, totalSizeBytes: 7 },
    ])
  })

  it('sorts snapshots newest first', async () => {
    await mkdir(join(backupRootDir, '2026-01-01T00-00-00-000Z'))
    await mkdir(join(backupRootDir, '2026-06-01T00-00-00-000Z'))
    await mkdir(join(backupRootDir, '2026-03-01T00-00-00-000Z'))

    const timestamps = (await listSnapshots(backupRootDir)).map((s) => s.timestamp)
    expect(timestamps).toEqual([
      '2026-06-01T00-00-00-000Z',
      '2026-03-01T00-00-00-000Z',
      '2026-01-01T00-00-00-000Z',
    ])
  })

  it('counts files in subfolders', async () => {
    await mkdir(join(backupRootDir, '2026-01-01T00-00-00-000Z', 'sub'), { recursive: true })
    await writeFile(join(backupRootDir, '2026-01-01T00-00-00-000Z', 'sub', 'save1.dat'), 'hello')

    expect(await listSnapshots(backupRootDir)).toEqual([
      { timestamp: '2026-01-01T00-00-00-000Z', fileCount: 1, totalSizeBytes: 5 },
    ])
  })
})
