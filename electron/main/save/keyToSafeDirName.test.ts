import { describe, it, expect } from 'vitest'
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { keyToSafeDirName } from './keyToSafeDirName'

describe('keyToSafeDirName', () => {
  it('returns a code-type key unchanged (already a valid single path segment)', () => {
    expect(keyToSafeDirName('RJ01234567')).toBe('RJ01234567')
  })

  it('hashes a path-type key (drive letter + backslashes) into a safe token', () => {
    const key = 'd:\\games\\myfolder'
    const safe = keyToSafeDirName(key)

    expect(safe).not.toBe(key)
    expect(safe).toMatch(/^[a-f0-9]{64}$/)
  })

  it('is deterministic for the same key', () => {
    const key = 'd:\\games\\myfolder'
    expect(keyToSafeDirName(key)).toBe(keyToSafeDirName(key))
  })

  it('produces different tokens for different path keys', () => {
    expect(keyToSafeDirName('d:\\games\\a')).not.toBe(keyToSafeDirName('d:\\games\\b'))
  })

  it('regression: a code-less (path-keyed) game backup directory can be created without throwing', async () => {
    const base = await mkdtemp(join(tmpdir(), 'dlibrary-userdata-'))
    try {
      const key = 'd:\\games\\myfolder'
      const backupDir = join(base, 'saves', keyToSafeDirName(key))

      await mkdir(backupDir, { recursive: true })

      const backupDirStat = await stat(backupDir)
      expect(backupDirStat.isDirectory()).toBe(true)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
