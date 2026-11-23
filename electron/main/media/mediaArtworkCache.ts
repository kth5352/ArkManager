import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { keyToSafeDirName } from '../save/keyToSafeDirName'

export type GenerationSnapshot = { track: number; workCover: number }

export interface ArtworkFsOps {
  rename: (from: string, to: string) => Promise<void>
  rm: (path: string, opts: { force: boolean }) => Promise<void>
  writeFile: (path: string, content: string) => Promise<void>
  readFile: (path: string) => Promise<string>
  mkdir: (path: string, opts: { recursive: boolean }) => Promise<unknown>
}

export interface ArtworkCache {
  trackGeneration(filePath: string): number
  workCoverGeneration(): number
  bumpWorkCoverGeneration(): Promise<void>
  loadWorkCoverGeneration(): Promise<void>
  /** Bumps the track generation, then deletes all four cache files (inside the track lock). */
  invalidate(filePath: string): Promise<void>
  commit(
    filePath: string,
    snapshot: GenerationSnapshot,
    files: Array<{ temp: string; final: string }>,
    writes?: Array<{ path: string; content: string }>
  ): Promise<'committed' | 'stale'>
  withTrackLock<T>(filePath: string, fn: () => Promise<T>): Promise<T>
}

const WORK_COVER_GENERATION_FILE = 'work-cover-generation.json'

export function artworkPaths(
  thumbDir: string,
  coverDir: string,
  filePath: string
): { thumb: string; notFound: string; cover: string; info: string } {
  const key = keyToSafeDirName(filePath)
  const thumb = join(thumbDir, `${key}.webp`)
  return {
    thumb,
    notFound: `${thumb}.notfound`,
    cover: join(coverDir, `${key}.webp`),
    info: join(coverDir, `${key}.json`),
  }
}

export function createArtworkCache(opts: {
  thumbDir: string
  coverDir: string
  fsOps?: Partial<ArtworkFsOps>
}): ArtworkCache {
  const { thumbDir, coverDir } = opts
  const fs: ArtworkFsOps = {
    rename,
    rm: (path, o) => rm(path, o),
    writeFile: (path, content) => writeFile(path, content, 'utf8'),
    readFile: (path) => readFile(path, 'utf8'),
    mkdir: (path, o) => mkdir(path, o),
    ...opts.fsOps,
  }

  const trackGenerations = new Map<string, number>()
  const locks = new Map<string, Promise<void>>()
  let workCover = 1
  let bumpChain: Promise<void> = Promise.resolve()
  const generationFile = join(coverDir, WORK_COVER_GENERATION_FILE)

  const trackGeneration = (filePath: string): number => trackGenerations.get(filePath) ?? 0

  function withTrackLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(filePath) ?? Promise.resolve()
    const run = prev.then(fn)
    const tail = run.then(
      () => undefined,
      () => undefined
    )
    locks.set(filePath, tail)
    void tail.then(() => {
      if (locks.get(filePath) === tail) locks.delete(filePath)
    })
    return run
  }

  async function writeAtomic(path: string, content: string): Promise<void> {
    const temp = `${path}.tmp`
    await fs.writeFile(temp, content)
    await fs.rename(temp, path)
  }

  return {
    trackGeneration,
    workCoverGeneration: () => workCover,
    withTrackLock,

    async loadWorkCoverGeneration() {
      try {
        const parsed = JSON.parse(await fs.readFile(generationFile)) as { generation?: unknown }
        if (
          typeof parsed.generation === 'number' &&
          Number.isInteger(parsed.generation) &&
          parsed.generation >= 1
        ) {
          workCover = parsed.generation
          return
        }
      } catch {
        // missing or corrupt: start at 1
      }
      workCover = 1
    },

    bumpWorkCoverGeneration() {
      // Memory is updated before disk by design: the in-memory value is always >= disk (safe direction).
      workCover += 1
      const generation = workCover
      const run = bumpChain.then(async () => {
        await fs.mkdir(coverDir, { recursive: true })
        await writeAtomic(generationFile, JSON.stringify({ generation }))
      })
      bumpChain = run.catch(() => undefined)
      return run
    },

    invalidate(filePath) {
      return withTrackLock(filePath, async () => {
        trackGenerations.set(filePath, trackGeneration(filePath) + 1)
        const p = artworkPaths(thumbDir, coverDir, filePath)
        await Promise.all(
          [p.thumb, p.notFound, p.cover, p.info].map((f) => fs.rm(f, { force: true }))
        )
      })
    },

    commit(filePath, snapshot, files, writes = []) {
      return withTrackLock(filePath, async () => {
        const rmQuiet = (f: string): Promise<void> =>
          fs.rm(f, { force: true }).catch(() => undefined)
        if (snapshot.track !== trackGeneration(filePath) || snapshot.workCover !== workCover) {
          await Promise.all(files.map((f) => rmQuiet(f.temp)))
          return 'stale' as const
        }
        const created: string[] = []
        try {
          const written = await Promise.allSettled(
            writes.map((w) => writeAtomic(w.path, w.content).then(() => created.push(w.path)))
          )
          const renamed = await Promise.allSettled(
            files.map((f) => fs.rename(f.temp, f.final).then(() => created.push(f.final)))
          )
          const failed = [...written, ...renamed].find((r) => r.status === 'rejected')
          if (failed) throw (failed as PromiseRejectedResult).reason
        } catch (err) {
          // Keep the four files together: undo everything this commit produced.
          await Promise.all([
            ...files.map((f) => rmQuiet(f.temp)),
            ...writes.map((w) => rmQuiet(`${w.path}.tmp`)),
            ...created.map(rmQuiet),
          ])
          throw err
        }
        return 'committed' as const
      })
    },
  }
}
