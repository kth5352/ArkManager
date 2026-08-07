import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readAdjacentLyrics } from './lyrics'

describe('readAdjacentLyrics', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('finds same-basename lrc next to a media file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lyrics-'))
    tempDirs.push(dir)
    await writeFile(join(dir, 'Song.mp3'), '')
    await writeFile(join(dir, 'Song.lrc'), '[00:01.00]hello')

    await expect(readAdjacentLyrics(join(dir, 'Song.mp3'), [dir])).resolves.toEqual({
      path: join(dir, 'Song.lrc'),
      text: '[00:01.00]hello',
    })
  })

  it('rejects paths outside allowed roots', async () => {
    await expect(readAdjacentLyrics('C:\\Other\\Song.mp3', ['D:\\Library'])).resolves.toBeNull()
  })

  it('rejects an adjacent lyric symlink whose resolved target is outside allowed roots', async () => {
    const readFile = vi.fn(async () => 'secret lyrics')
    const realpath = vi.fn(async () => 'C:\\Outside\\secret.lrc')

    await expect(
      readAdjacentLyrics('C:\\Library\\Song.mp3', ['C:\\Library'], {
        realpath,
        readFile,
      })
    ).resolves.toBeNull()

    expect(realpath).toHaveBeenCalledWith('C:\\Library\\Song.lrc')
    expect(readFile).not.toHaveBeenCalled()
  })
})
