import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { moveEntries } from './moveEntries'

describe('moveEntries', () => {
  let dir: string
  let sourceDir: string
  let destDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-move-'))
    sourceDir = join(dir, 'source')
    destDir = join(dir, 'dest')
    await mkdir(sourceDir)
    await mkdir(destDir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('moves a file to the destination directory', async () => {
    const filePath = join(sourceDir, 'a.zip')
    await writeFile(filePath, 'content')

    const results = await moveEntries([filePath], destDir)

    expect(results).toEqual([{ path: filePath, success: true, newPath: join(destDir, 'a.zip') }])
    expect(await readdir(sourceDir)).toEqual([])
    expect(await readFile(join(destDir, 'a.zip'), 'utf-8')).toBe('content')
  })

  it('moves a folder (with its contents) to the destination directory', async () => {
    const folderPath = join(sourceDir, 'MyGame')
    await mkdir(folderPath)
    await writeFile(join(folderPath, 'game.exe'), 'binary')

    const results = await moveEntries([folderPath], destDir)

    expect(results[0]).toMatchObject({ success: true, newPath: join(destDir, 'MyGame') })
    expect(await readdir(sourceDir)).toEqual([])
    expect(await readdir(join(destDir, 'MyGame'))).toEqual(['game.exe'])
  })

  it('rejects a move that would collide with an existing entry at the destination', async () => {
    const filePath = join(sourceDir, 'a.zip')
    await writeFile(filePath, 'source content')
    await writeFile(join(destDir, 'a.zip'), 'existing content')

    const results = await moveEntries([filePath], destDir)

    expect(results).toEqual([
      {
        path: filePath,
        success: false,
        error: '대상 위치에 같은 이름의 파일/폴더가 이미 있습니다.',
      },
    ])
    // Neither side was touched.
    expect(await readFile(filePath, 'utf-8')).toBe('source content')
    expect(await readFile(join(destDir, 'a.zip'), 'utf-8')).toBe('existing content')
  })

  it('processes a batch, continuing past a per-item failure', async () => {
    const pathA = join(sourceDir, 'a.zip')
    const pathB = join(sourceDir, 'b.zip')
    await writeFile(pathA, '')
    await writeFile(pathB, '')
    await writeFile(join(destDir, 'a.zip'), 'taken')

    const results = await moveEntries([pathA, pathB], destDir)

    expect(results.map((r) => r.success)).toEqual([false, true])
    expect(await readdir(sourceDir)).toEqual(['a.zip'])
    expect((await readdir(destDir)).sort()).toEqual(['a.zip', 'b.zip'])
  })

  it('is a no-op when the destination is the same folder the entry is already in', async () => {
    const filePath = join(sourceDir, 'a.zip')
    await writeFile(filePath, 'content')

    const results = await moveEntries([filePath], sourceDir)

    expect(results).toEqual([{ path: filePath, success: true, newPath: filePath }])
    expect(await readFile(filePath, 'utf-8')).toBe('content')
  })
})
