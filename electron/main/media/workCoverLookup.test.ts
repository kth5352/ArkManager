import { describe, it, expect, vi } from 'vitest'
import { createWorkCoverLookup, workCoverLookupFromDb } from './workCoverLookup'
import { createDbClient } from '../database/client'
import { normalizeLibraryPath } from '../database/librariesRepository'
import { setPathCodeOverride } from '../database/pathCodeOverridesRepository'
import { setCustomCoverPath } from '../database/gameUserDataRepository'
import { saveGameMetadata, setGameMetadataCoverPath } from '../database/gameMetadataRepository'
import { setSetting } from '../database/settingsRepository'

function makeDeps(
  overrides: {
    roots?: string[]
    getOverrideCode?: (folder: string) => string | null
    getCustomCover?: (key: string) => string | null
    getCrawledCover?: (code: string) => string | null
    fileExists?: (p: string) => Promise<boolean>
  } = {}
) {
  return {
    allowedRoots: () => overrides.roots ?? [],
    getOverrideCode: vi.fn(overrides.getOverrideCode ?? ((): string | null => null)),
    getCustomCover: vi.fn(overrides.getCustomCover ?? ((): string | null => null)),
    getCrawledCover: vi.fn(overrides.getCrawledCover ?? ((): string | null => null)),
    fileExists: vi.fn(overrides.fileExists ?? (async () => true)),
  }
}

describe('createWorkCoverLookup', () => {
  it('returns null without lookups for a file outside every root', async () => {
    const deps = makeDeps({ roots: ['D:\\ASMR'] })
    const result = await createWorkCoverLookup(deps)('E:\\Other\\RJ123456\\01.mp3')
    expect(result).toBeNull()
    expect(deps.getOverrideCode).not.toHaveBeenCalled()
    expect(deps.getCustomCover).not.toHaveBeenCalled()
    expect(deps.getCrawledCover).not.toHaveBeenCalled()
    expect(deps.fileExists).not.toHaveBeenCalled()
  })

  it('checks the root folder itself (media folder is the work folder)', async () => {
    const deps = makeDeps({
      roots: ['D:\\ASMR\\RJ123456'],
      getCrawledCover: vi.fn((code: string) => (code === 'RJ123456' ? 'C:\\covers\\rj.jpg' : null)),
    })
    const result = await createWorkCoverLookup(deps)('D:\\ASMR\\RJ123456\\01.mp3')
    expect(result).toBe('C:\\covers\\rj.jpg')
    // Only the root folder itself is looked up; D:\ASMR is never visited.
    expect(deps.getOverrideCode.mock.calls.map((c) => c[0])).toEqual([
      normalizeLibraryPath('D:\\ASMR\\RJ123456'),
    ])
  })

  it('does not look above the root folder when nothing is found', async () => {
    const deps = makeDeps({ roots: ['D:\\ASMR\\Misc'] })
    expect(await createWorkCoverLookup(deps)('D:\\ASMR\\Misc\\01.mp3')).toBeNull()
    expect(deps.getOverrideCode.mock.calls.map((c) => c[0])).toEqual([
      normalizeLibraryPath('D:\\ASMR\\Misc'),
    ])
  })

  it('walks to the outermost root when media folder is inside a library', async () => {
    const deps = makeDeps({
      roots: ['D:\\Lib\\RJ123456\\audio', 'D:\\Lib'],
      getCrawledCover: vi.fn((code: string) => (code === 'RJ123456' ? 'C:\\covers\\rj.jpg' : null)),
    })
    const result = await createWorkCoverLookup(deps)('D:\\Lib\\RJ123456\\audio\\a.mp3')
    expect(result).toBe('C:\\covers\\rj.jpg')
    expect(deps.getOverrideCode.mock.calls.map((c) => c[0])).toEqual([
      normalizeLibraryPath('D:\\Lib\\RJ123456\\audio'),
      normalizeLibraryPath('D:\\Lib\\RJ123456'),
    ])
  })

  it('custom cover on a codeless folder via path key', async () => {
    const folder = 'D:\\Lib\\Some Work'
    const deps = makeDeps({
      roots: ['D:\\Lib'],
      getCustomCover: vi.fn((key: string) =>
        key === normalizeLibraryPath(folder) ? 'C:\\custom.png' : null
      ),
    })
    const result = await createWorkCoverLookup(deps)(`${folder}\\01.mp3`)
    expect(result).toBe('C:\\custom.png')
    expect(deps.getCrawledCover).not.toHaveBeenCalled()
  })

  it('uses an override code when the folder name has none', async () => {
    const deps = makeDeps({
      roots: ['D:\\Lib'],
      getOverrideCode: vi.fn((f: string) =>
        f === normalizeLibraryPath('D:\\Lib\\Work') ? 'RJ777777' : null
      ),
      getCrawledCover: vi.fn((code: string) => (code === 'RJ777777' ? 'C:\\o.jpg' : null)),
    })
    expect(await createWorkCoverLookup(deps)('D:\\Lib\\Work\\a.mp3')).toBe('C:\\o.jpg')
  })

  it('custom cover wins over crawled cover; nearest folder wins', async () => {
    const deps = makeDeps({
      roots: ['D:\\Lib'],
      getCustomCover: vi.fn((key: string) =>
        key === 'RJ123456' ? 'C:\\custom.png' : key === 'RJ999999' ? 'C:\\outer.png' : null
      ),
      getCrawledCover: vi.fn(() => 'C:\\crawled.jpg'),
    })
    expect(await createWorkCoverLookup(deps)('D:\\Lib\\RJ999999\\RJ123456\\a.mp3')).toBe(
      'C:\\custom.png'
    )
    const crawledOnly = makeDeps({
      roots: ['D:\\Lib'],
      getCrawledCover: vi.fn((c: string) => `C:\\${c}.jpg`),
    })
    expect(await createWorkCoverLookup(crawledOnly)('D:\\Lib\\RJ999999\\RJ123456\\a.mp3')).toBe(
      'C:\\RJ123456.jpg'
    )
  })

  it('skips paths whose file no longer exists', async () => {
    const deps = makeDeps({
      roots: ['D:\\Lib'],
      getCustomCover: vi.fn((key: string) => (key === 'RJ123456' ? 'C:\\gone.png' : null)),
      getCrawledCover: vi.fn((c: string) => `C:\\${c}.jpg`),
      fileExists: vi.fn(async (p: string) => p !== 'C:\\gone.png' && p !== 'C:\\RJ123456.jpg'),
    })
    expect(await createWorkCoverLookup(deps)('D:\\Lib\\RJ999999\\RJ123456\\a.mp3')).toBe(
      'C:\\RJ999999.jpg'
    )
  })
})

describe('workCoverLookupFromDb', () => {
  it('reads override code, crawled cover and custom cover from the database', async () => {
    const db = createDbClient(':memory:')
    setSetting(db, 'media-folder', 'D:\\Lib')
    setPathCodeOverride(db, normalizeLibraryPath('D:\\Lib\\Work'), 'RJ777777')
    saveGameMetadata(db, 'RJ777777', {
      title: 't',
      circle: 'c',
      releaseDate: null,
      genres: [],
      workType: null,
    } as never)
    setGameMetadataCoverPath(db, 'RJ777777', process.execPath)
    const lookup = workCoverLookupFromDb(db)
    expect(await lookup('D:\\Lib\\Work\\a.mp3')).toBe(process.execPath)
    expect(await lookup('E:\\x\\a.mp3')).toBeNull()

    setGameMetadataCoverPath(db, 'RJ777777', 'C:\\definitely\\missing.webp')
    setCustomCoverPath(db, 'RJ777777', 'code', process.execPath)
    expect(await lookup('D:\\Lib\\Work\\a.mp3')).toBe(process.execPath)
  })
})
