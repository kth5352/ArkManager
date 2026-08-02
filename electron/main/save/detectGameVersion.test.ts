import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectGameVersion } from './detectGameVersion'

describe('detectGameVersion', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-version-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("prefers the configured executable's PE version when available", async () => {
    const exePath = join(dir, 'Game.exe')
    await writeFile(exePath, '')
    const readExeVersion = async (path: string) => (path === exePath ? '1.2.3' : null)

    const version = await detectGameVersion(dir, exePath, readExeVersion)
    expect(version).toBe('1.2.3')
  })

  it('strips a trailing build comment from a real-shaped Windows FileVersion string', async () => {
    const exePath = join(dir, 'Game.exe')
    await writeFile(exePath, '')
    const readExeVersion = async (path: string) =>
      path === exePath ? '10.0.19041.4522 (WinBuild.160101.0800)' : null

    const version = await detectGameVersion(dir, exePath, readExeVersion)
    expect(version).toBe('10.0.19041.4522')
  })

  it('leaves a PE version string with no trailing text unchanged', async () => {
    const exePath = join(dir, 'Game.exe')
    await writeFile(exePath, '')
    const readExeVersion = async (path: string) => (path === exePath ? 'unknown' : null)

    const version = await detectGameVersion(dir, exePath, readExeVersion)
    expect(version).toBe('unknown')
  })

  it('falls back to any other exe in the folder when the configured one has no PE version', async () => {
    const configuredExe = join(dir, 'Launcher.exe')
    const otherExe = join(dir, 'Game.exe')
    await writeFile(configuredExe, '')
    await writeFile(otherExe, '')
    const readExeVersion = async (path: string) => (path === otherExe ? '2.0.0' : null)

    const version = await detectGameVersion(dir, configuredExe, readExeVersion)
    expect(version).toBe('2.0.0')
  })

  it('falls back to a version pattern in a file/folder name when no exe has a PE version', async () => {
    await writeFile(join(dir, 'Game.exe'), '')
    await mkdir(join(dir, 'MyGame_v3.4.5'))
    const readExeVersion = async () => null

    const version = await detectGameVersion(dir, null, readExeVersion)
    expect(version).toBe('3.4.5')
  })

  it('returns null when nothing yields a version', async () => {
    await writeFile(join(dir, 'Game.exe'), '')
    const readExeVersion = async () => null

    const version = await detectGameVersion(dir, null, readExeVersion)
    expect(version).toBeNull()
  })

  it('returns null for a folder that does not exist, without throwing', async () => {
    const readExeVersion = async () => null
    const version = await detectGameVersion(join(dir, 'nonexistent'), null, readExeVersion)
    expect(version).toBeNull()
  })
})
