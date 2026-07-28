import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listExecutables } from './listExecutables'

describe('listExecutables', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlibrary-exe-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('finds .exe files at the top level of the folder', async () => {
    await writeFile(join(dir, 'game.exe'), '')
    await writeFile(join(dir, 'readme.txt'), '')

    const result = await listExecutables(dir)
    expect(result).toEqual([join(dir, 'game.exe')])
  })

  it('is case-insensitive about the .exe extension', async () => {
    await writeFile(join(dir, 'Game.EXE'), '')
    expect(await listExecutables(dir)).toEqual([join(dir, 'Game.EXE')])
  })

  it('does not descend into subfolders', async () => {
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'sub', 'nested.exe'), '')
    await writeFile(join(dir, 'top.exe'), '')

    expect(await listExecutables(dir)).toEqual([join(dir, 'top.exe')])
  })

  it('returns an empty array for a nonexistent path', async () => {
    expect(await listExecutables(join(dir, 'does-not-exist'))).toEqual([])
  })
})
