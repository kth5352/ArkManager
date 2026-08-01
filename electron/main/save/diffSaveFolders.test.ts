import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diffSaveFolders } from './diffSaveFolders'

describe('diffSaveFolders', () => {
  let leftDir: string
  let rightDir: string

  beforeEach(async () => {
    leftDir = await mkdtemp(join(tmpdir(), 'ark-manager-diff-left-'))
    rightDir = await mkdtemp(join(tmpdir(), 'ark-manager-diff-right-'))
  })

  afterEach(async () => {
    await rm(leftDir, { recursive: true, force: true })
    await rm(rightDir, { recursive: true, force: true })
  })

  it('reports no differences for identical folders', async () => {
    await writeFile(join(leftDir, 'save1.dat'), 'hello')
    await writeFile(join(rightDir, 'save1.dat'), 'hello')

    expect(await diffSaveFolders(leftDir, rightDir)).toEqual([])
  })

  it('reports a file only in the right folder as added', async () => {
    await writeFile(join(rightDir, 'new.dat'), 'hello')

    expect(await diffSaveFolders(leftDir, rightDir)).toEqual([
      { relativePath: 'new.dat', status: 'added' },
    ])
  })

  it('reports a file only in the left folder as removed', async () => {
    await writeFile(join(leftDir, 'old.dat'), 'hello')

    expect(await diffSaveFolders(leftDir, rightDir)).toEqual([
      { relativePath: 'old.dat', status: 'removed' },
    ])
  })

  it('reports a file with a different size as modified', async () => {
    await writeFile(join(leftDir, 'save1.dat'), 'hello')
    await writeFile(join(rightDir, 'save1.dat'), 'hello world')

    expect(await diffSaveFolders(leftDir, rightDir)).toEqual([
      { relativePath: 'save1.dat', status: 'modified' },
    ])
  })

  it('walks subfolders and reports relative paths with forward slashes', async () => {
    await mkdir(join(rightDir, 'sub'))
    await writeFile(join(rightDir, 'sub', 'nested.dat'), 'hello')

    expect(await diffSaveFolders(leftDir, rightDir)).toEqual([
      { relativePath: 'sub/nested.dat', status: 'added' },
    ])
  })

  it('treats a null left side as empty, reporting every right-side file as added', async () => {
    await writeFile(join(rightDir, 'save1.dat'), 'hello')

    expect(await diffSaveFolders(null, rightDir)).toEqual([
      { relativePath: 'save1.dat', status: 'added' },
    ])
  })

  it('treats a nonexistent left directory the same as an empty one', async () => {
    await writeFile(join(rightDir, 'save1.dat'), 'hello')

    expect(await diffSaveFolders(join(leftDir, 'does-not-exist'), rightDir)).toEqual([
      { relativePath: 'save1.dat', status: 'added' },
    ])
  })
})
