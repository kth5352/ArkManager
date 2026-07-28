import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findLocaleEmulatorAt } from './localeEmulator'

describe('findLocaleEmulatorAt', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlibrary-le-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns the LEProc.exe path when it exists under the given base dir', async () => {
    await mkdir(join(dir, 'Locale Emulator'), { recursive: true })
    await writeFile(join(dir, 'Locale Emulator', 'LEProc.exe'), '')

    const result = await findLocaleEmulatorAt(dir)
    expect(result).toBe(join(dir, 'Locale Emulator', 'LEProc.exe'))
  })

  it('returns null when LEProc.exe does not exist under the given base dir', async () => {
    expect(await findLocaleEmulatorAt(dir)).toBeNull()
  })
})
