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

  it('uses the only lrc file in the same folder when an exact basename match is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lyrics-'))
    tempDirs.push(dir)
    await writeFile(join(dir, 'Track 01.mp3'), '')
    await writeFile(join(dir, 'AlbumLyrics.lrc'), '[00:01.00]hello')

    await expect(readAdjacentLyrics(join(dir, 'Track 01.mp3'), [dir])).resolves.toEqual({
      path: join(dir, 'AlbumLyrics.lrc'),
      text: '[00:01.00]hello',
    })
  })

  it('does not guess when multiple non-matching lrc files exist in the same folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lyrics-'))
    tempDirs.push(dir)
    await writeFile(join(dir, 'Track 01.mp3'), '')
    await writeFile(join(dir, 'A.lrc'), '[00:01.00]a')
    await writeFile(join(dir, 'B.lrc'), '[00:01.00]b')

    await expect(readAdjacentLyrics(join(dir, 'Track 01.mp3'), [dir])).resolves.toBeNull()
  })

  it('rejects paths outside allowed roots', async () => {
    await expect(readAdjacentLyrics('C:\\Other\\Song.mp3', ['D:\\Library'])).resolves.toBeNull()
  })

  it('finds lyrics for a track trusted only via an exact trustedPaths match', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lyrics-'))
    tempDirs.push(dir)
    const songPath = join(dir, 'Song.mp3')
    await writeFile(songPath, '')
    await writeFile(join(dir, 'Song.lrc'), '[00:01.00]hello')

    await expect(readAdjacentLyrics(songPath, [], [songPath])).resolves.toEqual({
      path: join(dir, 'Song.lrc'),
      text: '[00:01.00]hello',
    })
  })

  it('still rejects a path in neither allowedRoots nor trustedPaths', async () => {
    await expect(
      readAdjacentLyrics('C:\\Other\\Song.mp3', ['D:\\Library'], ['D:\\Library\\Other.mp3'])
    ).resolves.toBeNull()
  })

  it('rejects an adjacent lyric symlink whose resolved target is outside allowed roots', async () => {
    const readFile = vi.fn(async () => 'secret lyrics')
    const realpath = vi.fn(async () => 'C:\\Outside\\secret.lrc')

    await expect(
      readAdjacentLyrics('C:\\Library\\Song.mp3', ['C:\\Library'], [], {
        realpath,
        readFile,
        readdir: vi.fn(async () => []),
      })
    ).resolves.toBeNull()

    expect(realpath).toHaveBeenCalledWith('C:\\Library\\Song.lrc')
    expect(readFile).not.toHaveBeenCalled()
  })

  it('finds a same-basename .vtt file when no .lrc exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lyrics-'))
    tempDirs.push(dir)
    await writeFile(join(dir, 'Song.mp4'), '')
    await writeFile(join(dir, 'Song.vtt'), 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi\n')

    await expect(readAdjacentLyrics(join(dir, 'Song.mp4'), [dir])).resolves.toEqual({
      path: join(dir, 'Song.vtt'),
      text: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi\n',
    })
  })

  it('finds a same-basename .ass file when no .lrc or .vtt exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lyrics-'))
    tempDirs.push(dir)
    await writeFile(join(dir, 'Song.mp4'), '')
    await writeFile(join(dir, 'Song.ass'), '[Events]\n')

    await expect(readAdjacentLyrics(join(dir, 'Song.mp4'), [dir])).resolves.toEqual({
      path: join(dir, 'Song.ass'),
      text: '[Events]\n',
    })
  })

  it('prefers .lrc over .vtt when both exist with the same basename', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lyrics-'))
    tempDirs.push(dir)
    await writeFile(join(dir, 'Song.mp3'), '')
    await writeFile(join(dir, 'Song.lrc'), '[00:01.00]from lrc')
    await writeFile(join(dir, 'Song.vtt'), 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nfrom vtt\n')

    await expect(readAdjacentLyrics(join(dir, 'Song.mp3'), [dir])).resolves.toEqual({
      path: join(dir, 'Song.lrc'),
      text: '[00:01.00]from lrc',
    })
  })

  it('uses the only subtitle file (any of lrc/vtt/ass) in the folder when no exact basename match exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lyrics-'))
    tempDirs.push(dir)
    await writeFile(join(dir, 'Track 01.mp3'), '')
    await writeFile(join(dir, 'AlbumSubs.ass'), '[Events]\n')

    await expect(readAdjacentLyrics(join(dir, 'Track 01.mp3'), [dir])).resolves.toEqual({
      path: join(dir, 'AlbumSubs.ass'),
      text: '[Events]\n',
    })
  })
})
