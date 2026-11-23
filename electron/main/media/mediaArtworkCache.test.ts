import { mkdtemp, readFile, rename, rm, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { artworkPaths, createArtworkCache, type ArtworkFsOps } from './mediaArtworkCache'

let root: string
let thumbDir: string
let coverDir: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'artwork-cache-'))
  thumbDir = join(root, 'thumb')
  coverDir = join(root, 'cover')
  await mkdir(thumbDir, { recursive: true })
  await mkdir(coverDir, { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const track = 'D:\\music\\a.mp3'

function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void
  const promise = new Promise<void>((r) => {
    open = r
  })
  return { promise, open }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 20))

describe('mediaArtworkCache', () => {
  it('invalidate removes all four files and bumps track generation', async () => {
    const cache = createArtworkCache({ thumbDir, coverDir })
    const p = artworkPaths(thumbDir, coverDir, track)
    for (const f of [p.thumb, p.notFound, p.cover, p.info]) await writeFile(f, 'x')
    expect(cache.trackGeneration(track)).toBe(0)
    await cache.invalidate(track)
    expect(cache.trackGeneration(track)).toBe(1)
    for (const f of [p.thumb, p.notFound, p.cover, p.info]) expect(existsSync(f)).toBe(false)
  })

  it('commit with matching snapshot renames every temp to final', async () => {
    const cache = createArtworkCache({ thumbDir, coverDir })
    const p = artworkPaths(thumbDir, coverDir, track)
    await writeFile(p.thumb + '.tmp', 'thumb')
    await writeFile(p.cover + '.tmp', 'cover')
    const snap = { track: cache.trackGeneration(track), workCover: cache.workCoverGeneration() }
    const res = await cache.commit(
      track,
      snap,
      [
        { temp: p.thumb + '.tmp', final: p.thumb },
        { temp: p.cover + '.tmp', final: p.cover },
      ],
      [{ path: p.info, content: '{"a":1}' }]
    )
    expect(res).toBe('committed')
    expect(await readFile(p.thumb, 'utf8')).toBe('thumb')
    expect(await readFile(p.cover, 'utf8')).toBe('cover')
    expect(await readFile(p.info, 'utf8')).toBe('{"a":1}')
    expect(existsSync(p.thumb + '.tmp')).toBe(false)
  })

  it("commit after invalidate returns 'stale' and deletes temps, leaves no final files", async () => {
    const cache = createArtworkCache({ thumbDir, coverDir })
    const p = artworkPaths(thumbDir, coverDir, track)
    await writeFile(p.thumb + '.tmp', 'thumb')
    const snap = { track: cache.trackGeneration(track), workCover: cache.workCoverGeneration() }
    await cache.invalidate(track)
    const res = await cache.commit(
      track,
      snap,
      [{ temp: p.thumb + '.tmp', final: p.thumb }],
      [{ path: p.info, content: '{}' }]
    )
    expect(res).toBe('stale')
    expect(existsSync(p.thumb + '.tmp')).toBe(false)
    expect(existsSync(p.thumb)).toBe(false)
    expect(existsSync(p.info)).toBe(false)
  })

  it('invalidate waits for an in-progress commit', async () => {
    const g = gate()
    const fsOps: Partial<ArtworkFsOps> = {
      rename: async (a, b) => {
        await g.promise
        await rename(a, b)
      },
    }
    const cache = createArtworkCache({ thumbDir, coverDir, fsOps })
    const p = artworkPaths(thumbDir, coverDir, track)
    await writeFile(p.thumb + '.tmp', 'thumb')
    const snap = { track: 0, workCover: cache.workCoverGeneration() }
    const commit = cache.commit(track, snap, [{ temp: p.thumb + '.tmp', final: p.thumb }])
    await tick()
    const inv = cache.invalidate(track)
    await tick()
    // invalidate must not have bumped or deleted while commit holds the lock
    expect(cache.trackGeneration(track)).toBe(0)
    g.open()
    expect(await commit).toBe('committed')
    await inv
    expect(cache.trackGeneration(track)).toBe(1)
    expect(existsSync(p.thumb)).toBe(false)
  })

  it('commit waits for an in-progress invalidate', async () => {
    const g = gate()
    const fsOps: Partial<ArtworkFsOps> = {
      rm: async (path, opts) => {
        await g.promise
        await rm(path, opts)
      },
    }
    const cache = createArtworkCache({ thumbDir, coverDir, fsOps })
    const p = artworkPaths(thumbDir, coverDir, track)
    await writeFile(p.thumb, 'old')
    const inv = cache.invalidate(track)
    await tick()
    // generation is bumped before deletion
    expect(cache.trackGeneration(track)).toBe(1)
    await writeFile(p.thumb + '.tmp', 'new')
    const snap = { track: cache.trackGeneration(track), workCover: cache.workCoverGeneration() }
    const commit = cache.commit(track, snap, [{ temp: p.thumb + '.tmp', final: p.thumb }])
    await tick()
    expect(existsSync(p.thumb + '.tmp')).toBe(true)
    g.open()
    await inv
    expect(await commit).toBe('committed')
    expect(await readFile(p.thumb, 'utf8')).toBe('new')
  })

  it('work cover generation persists to file and starts at 1', async () => {
    const a = createArtworkCache({ thumbDir, coverDir })
    expect(a.workCoverGeneration()).toBe(1)
    await a.loadWorkCoverGeneration()
    expect(a.workCoverGeneration()).toBe(1)
    await a.bumpWorkCoverGeneration()
    expect(a.workCoverGeneration()).toBe(2)
    const raw = JSON.parse(await readFile(join(coverDir, 'work-cover-generation.json'), 'utf8'))
    expect(raw).toEqual({ generation: 2 })
    const b = createArtworkCache({ thumbDir, coverDir })
    await b.loadWorkCoverGeneration()
    expect(b.workCoverGeneration()).toBe(2)
  })

  it('commit failure removes temp files and finals it created and rethrows', async () => {
    let calls = 0
    const fsOps: Partial<ArtworkFsOps> = {
      rename: async (a, b) => {
        calls += 1
        if (calls === 2 && !a.endsWith('.json.tmp')) throw new Error('boom')
        await rename(a, b)
      },
    }
    const cache = createArtworkCache({ thumbDir, coverDir, fsOps })
    const p = artworkPaths(thumbDir, coverDir, track)
    await writeFile(p.thumb + '.tmp', 'thumb')
    await writeFile(p.cover + '.tmp', 'cover')
    const snap = { track: 0, workCover: cache.workCoverGeneration() }
    const files = [
      { temp: p.thumb + '.tmp', final: p.thumb },
      { temp: p.cover + '.tmp', final: p.cover },
    ]
    await expect(
      cache.commit(track, snap, files, [{ path: p.info, content: '{}' }])
    ).rejects.toThrow('boom')
    for (const f of [p.thumb + '.tmp', p.cover + '.tmp', p.info + '.tmp', p.thumb, p.cover, p.info])
      expect(existsSync(f)).toBe(false)
    // lock chain is not poisoned
    await writeFile(p.thumb + '.tmp', 'again')
    expect(await cache.commit(track, snap, [{ temp: p.thumb + '.tmp', final: p.thumb }])).toBe(
      'committed'
    )
    await cache.invalidate(track)
    expect(existsSync(p.thumb)).toBe(false)
  })

  it('commit stale due to work-cover generation mismatch deletes temps', async () => {
    const cache = createArtworkCache({ thumbDir, coverDir })
    const p = artworkPaths(thumbDir, coverDir, track)
    await writeFile(p.thumb + '.tmp', 'thumb')
    const snap = { track: 0, workCover: cache.workCoverGeneration() }
    await cache.bumpWorkCoverGeneration()
    const res = await cache.commit(track, snap, [{ temp: p.thumb + '.tmp', final: p.thumb }])
    expect(res).toBe('stale')
    expect(existsSync(p.thumb + '.tmp')).toBe(false)
    expect(existsSync(p.thumb)).toBe(false)
  })

  it('concurrent bumps both persist and end at +2', async () => {
    const cache = createArtworkCache({ thumbDir, coverDir })
    await Promise.all([cache.bumpWorkCoverGeneration(), cache.bumpWorkCoverGeneration()])
    expect(cache.workCoverGeneration()).toBe(3)
    const raw = JSON.parse(await readFile(join(coverDir, 'work-cover-generation.json'), 'utf8'))
    expect(raw).toEqual({ generation: 3 })
  })
})
