import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { readAdjacentLyrics } from './lyrics'

describe('readAdjacentLyrics', () => {
  it('finds same-basename lrc next to a media file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lyrics-'))
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
})
