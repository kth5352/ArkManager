import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectLocaleEmulator, findLocaleEmulatorAt } from './localeEmulator'

describe('findLocaleEmulatorAt', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-le-'))
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

  it("finds LEProc.exe nested several levels deep inside another app's own folder", async () => {
    // Mirrors a real install: Program Files\DLsiteNest\Assets\LocalEmulator
    // \LEProc.exe - bundled inside another app, not under a top-level
    // "Locale Emulator" folder at all.
    await mkdir(join(dir, 'DLsiteNest', 'Assets', 'LocalEmulator'), { recursive: true })
    const expected = join(dir, 'DLsiteNest', 'Assets', 'LocalEmulator', 'LEProc.exe')
    await writeFile(expected, '')

    expect(await findLocaleEmulatorAt(dir)).toBe(expected)
  })

  it('does not descend past the given depth', async () => {
    await mkdir(join(dir, 'a', 'b', 'c', 'd'), { recursive: true })
    await writeFile(join(dir, 'a', 'b', 'c', 'd', 'LEProc.exe'), '')

    expect(await findLocaleEmulatorAt(dir, 2)).toBeNull()
  })
})

describe('detectLocaleEmulator', () => {
  let dir: string
  let customExePath: string
  // Auto-detect reads these env vars at call time - the real dev/CI machine
  // running this test may or may not actually have Locale Emulator
  // installed, so the fallback-path candidates are pointed at an empty temp
  // dir here to make the "no known install found" case deterministic
  // instead of depending on the host machine's real state.
  const originalEnv = {
    ProgramFiles: process.env['ProgramFiles'],
    'ProgramFiles(x86)': process.env['ProgramFiles(x86)'],
    LOCALAPPDATA: process.env['LOCALAPPDATA'],
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-le-override-'))
    customExePath = join(dir, 'LEProc.exe')
    await writeFile(customExePath, '')
    process.env['ProgramFiles'] = join(dir, 'empty-program-files')
    process.env['ProgramFiles(x86)'] = join(dir, 'empty-program-files-x86')
    process.env['LOCALAPPDATA'] = join(dir, 'empty-localappdata')
  })

  afterEach(async () => {
    process.env['ProgramFiles'] = originalEnv['ProgramFiles']
    process.env['ProgramFiles(x86)'] = originalEnv['ProgramFiles(x86)']
    process.env['LOCALAPPDATA'] = originalEnv['LOCALAPPDATA']
    await rm(dir, { recursive: true, force: true })
  })

  it('returns the override path when it points at an existing file', async () => {
    expect(await detectLocaleEmulator(customExePath)).toBe(customExePath)
  })

  it('falls back to auto-detection when the override path no longer exists', async () => {
    const staleOverride = join(dir, 'moved', 'LEProc.exe')
    expect(await detectLocaleEmulator(staleOverride)).toBeNull()
  })

  it('finds a per-user install under LOCALAPPDATA/Programs when no override is set', async () => {
    await mkdir(join(dir, 'empty-localappdata', 'Programs', 'Locale Emulator'), { recursive: true })
    const expected = join(dir, 'empty-localappdata', 'Programs', 'Locale Emulator', 'LEProc.exe')
    await writeFile(expected, '')

    expect(await detectLocaleEmulator(null)).toBe(expected)
  })
})
