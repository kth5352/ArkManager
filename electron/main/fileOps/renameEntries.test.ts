import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renameEntries } from './renameEntries'

describe('renameEntries', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-rename-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('renames a file in place', async () => {
    const path = join(dir, 'old.zip')
    await writeFile(path, '')

    const results = await renameEntries([{ path, newName: 'new.zip' }])

    expect(results).toEqual([{ path, success: true, newPath: join(dir, 'new.zip') }])
    expect(await readdir(dir)).toEqual(['new.zip'])
  })

  it('renames a folder in place', async () => {
    const path = join(dir, 'OldFolder')
    await mkdir(path)

    const results = await renameEntries([{ path, newName: 'NewFolder' }])

    expect(results[0]).toMatchObject({ success: true, newPath: join(dir, 'NewFolder') })
    expect(await readdir(dir)).toEqual(['NewFolder'])
  })

  it('allows a case-only rename instead of rejecting it as a collision', async () => {
    const path = join(dir, 'mygame')
    await mkdir(path)

    const results = await renameEntries([{ path, newName: 'MyGame' }])

    expect(results[0].success).toBe(true)
    expect(await readdir(dir)).toEqual(['MyGame'])
  })

  it('rejects a rename that would collide with a different existing entry', async () => {
    const path = join(dir, 'a.zip')
    await writeFile(path, '')
    await writeFile(join(dir, 'b.zip'), '')

    const results = await renameEntries([{ path, newName: 'b.zip' }])

    expect(results).toEqual([
      { path, success: false, error: '같은 이름의 파일/폴더가 이미 있습니다.' },
    ])
    // The original file must be untouched, not overwritten.
    expect(await readdir(dir)).toEqual(['a.zip', 'b.zip'])
  })

  it('rejects a name containing a path separator', async () => {
    const path = join(dir, 'a.zip')
    await writeFile(path, '')

    const results = await renameEntries([{ path, newName: '..\\escaped.zip' }])

    expect(results[0].success).toBe(false)
    expect(await readdir(dir)).toEqual(['a.zip'])
  })

  it('rejects an empty name', async () => {
    const path = join(dir, 'a.zip')
    await writeFile(path, '')

    const results = await renameEntries([{ path, newName: '   ' }])

    expect(results[0].success).toBe(false)
  })

  it('rejects a Windows-reserved device name, with or without an extension', async () => {
    const path = join(dir, 'a.zip')
    await writeFile(path, '')

    const results = await renameEntries([
      { path, newName: 'CON' },
      { path, newName: 'con.txt' },
      { path, newName: 'LPT1' },
    ])

    expect(results.every((r) => r.success === false)).toBe(true)
    expect(await readdir(dir)).toEqual(['a.zip'])
  })

  it('rejects a name with a trailing dot', async () => {
    const path = join(dir, 'a.zip')
    await writeFile(path, '')

    const results = await renameEntries([{ path, newName: 'trailing dot.' }])

    expect(results[0].success).toBe(false)
    expect(await readdir(dir)).toEqual(['a.zip'])
  })

  it('uses the trimmed name for the actual rename, not just for validation', async () => {
    const path = join(dir, 'a.zip')
    await writeFile(path, '')

    const results = await renameEntries([{ path, newName: '  padded name  ' }])

    expect(results[0]).toMatchObject({ success: true, newPath: join(dir, 'padded name') })
    expect(await readdir(dir)).toEqual(['padded name'])
  })

  it('processes a batch, continuing past a per-item failure', async () => {
    const pathA = join(dir, 'a.zip')
    const pathB = join(dir, 'b.zip')
    await writeFile(pathA, '')
    await writeFile(pathB, '')
    await writeFile(join(dir, 'taken.zip'), '')

    const results = await renameEntries([
      { path: pathA, newName: 'taken.zip' },
      { path: pathB, newName: 'renamed-b.zip' },
    ])

    expect(results.map((r) => r.success)).toEqual([false, true])
    expect((await readdir(dir)).sort()).toEqual(['a.zip', 'renamed-b.zip', 'taken.zip'])
  })
})
