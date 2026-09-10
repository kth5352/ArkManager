import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDbClient, type AppDatabase } from './client'
import { gameMetadata } from './schema'
import {
  getGameMetadata,
  saveGameMetadata,
  setGameMetadataCoverPath,
  getManyGameMetadata,
  rewriteCoverImagePathPrefix,
  clearAllGameMetadata,
  listAllGameMetadataCodes,
} from './gameMetadataRepository'
import { getGameUserData, setFavorite } from './gameUserDataRepository'

describe('gameMetadataRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns undefined when no metadata was ever recorded for a code', () => {
    expect(getGameMetadata(db, 'RJ01234567')).toBeUndefined()
  })

  it('saves crawled metadata and reads it back with genres parsed as an array', () => {
    saveGameMetadata(db, 'RJ01169914', {
      title: 'シニシスタ2 SiNiSistar2',
      circle: 'ウー',
      releaseDate: '2025-04-12',
      genres: ['ドット', 'シスター'],
      coverImageUrl: 'https://img.dlsite.jp/example.jpg',
      workType: 'SOU',
    })

    const row = getGameMetadata(db, 'RJ01169914')
    expect(row?.title).toBe('シニシスタ2 SiNiSistar2')
    expect(row?.genres).toEqual(['ドット', 'シスター'])
    expect(row?.coverImagePath).toBeNull()
    expect(row?.workType).toBe('SOU')
  })

  it('reads back workType as null for a row saved without it (pre-existing DB row simulation)', () => {
    saveGameMetadata(db, 'RJ02000000', {
      title: 'Old Row',
      circle: 'Old Circle',
      releaseDate: '2024-01-01',
      genres: [],
      coverImageUrl: null,
      workType: null,
    })

    expect(getGameMetadata(db, 'RJ02000000')?.workType).toBeNull()
  })

  it('sets the cover image path independently of the crawled text fields', () => {
    saveGameMetadata(db, 'RJ01169914', {
      title: 'Test',
      circle: 'Test Circle',
      releaseDate: '2025-01-01',
      genres: [],
      coverImageUrl: null,
      workType: null,
    })

    setGameMetadataCoverPath(db, 'RJ01169914', '/cache/covers/RJ01169914.webp')

    expect(getGameMetadata(db, 'RJ01169914')?.coverImagePath).toBe('/cache/covers/RJ01169914.webp')
  })

  it('fetches multiple codes in one call, omitting codes with no row', () => {
    saveGameMetadata(db, 'RJ01111111', {
      title: 'Game A',
      circle: 'Circle A',
      releaseDate: '2025-01-01',
      genres: ['액션'],
      coverImageUrl: null,
      workType: null,
    })
    saveGameMetadata(db, 'RJ02222222', {
      title: 'Game B',
      circle: 'Circle B',
      releaseDate: '2025-02-02',
      genres: ['드라마'],
      coverImageUrl: null,
      workType: null,
    })

    const result = getManyGameMetadata(db, ['RJ01111111', 'RJ02222222', 'RJ99999999'])
    expect(result.size).toBe(2)
    expect(result.get('RJ01111111')?.title).toBe('Game A')
    expect(result.has('RJ99999999')).toBe(false)
  })

  it('returns an empty map for an empty code list', () => {
    expect(getManyGameMetadata(db, []).size).toBe(0)
  })

  // D4 (performance-reliability plan): genres is a free-text DB column
  // holding a JSON string, not validated on write beyond JSON.stringify's
  // own output - a crash mid-write, manual DB editing, or a future
  // migration bug could leave it holding something JSON.parse can't read,
  // or something that parses but isn't a string array. Simulated here by
  // writing an invalid value directly to the column after a normal save,
  // never against the real user DB.
  describe('corrupted genres JSON (D4)', () => {
    it('falls back to an empty genres array (not a thrown error) for syntactically invalid JSON', () => {
      saveGameMetadata(db, 'RJ01111111', {
        title: 'A',
        circle: 'A',
        releaseDate: '2025-01-01',
        genres: ['원래장르'],
        coverImageUrl: null,
        workType: null,
      })
      db.update(gameMetadata)
        .set({ genres: '{not valid json' })
        .where(eq(gameMetadata.code, 'RJ01111111'))
        .run()

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const row = getGameMetadata(db, 'RJ01111111')
      warn.mockRestore()

      expect(row?.genres).toEqual([])
      expect(row?.title).toBe('A')
    })

    it('falls back to an empty genres array for valid JSON that is not a string array', () => {
      saveGameMetadata(db, 'RJ02222222', {
        title: 'B',
        circle: 'B',
        releaseDate: '2025-01-01',
        genres: [],
        coverImageUrl: null,
        workType: null,
      })
      db.update(gameMetadata)
        .set({ genres: '{"unexpected":"shape"}' })
        .where(eq(gameMetadata.code, 'RJ02222222'))
        .run()

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const row = getGameMetadata(db, 'RJ02222222')
      warn.mockRestore()

      expect(row?.genres).toEqual([])
    })

    it('lets a corrupted row fall back safely without failing the rest of a batch fetch', () => {
      saveGameMetadata(db, 'RJ01111111', {
        title: 'Good A',
        circle: 'A',
        releaseDate: '2025-01-01',
        genres: ['액션'],
        coverImageUrl: null,
        workType: null,
      })
      saveGameMetadata(db, 'RJ02222222', {
        title: 'Corrupted B',
        circle: 'B',
        releaseDate: '2025-01-01',
        genres: [],
        coverImageUrl: null,
        workType: null,
      })
      db.update(gameMetadata)
        .set({ genres: 'not json at all' })
        .where(eq(gameMetadata.code, 'RJ02222222'))
        .run()
      saveGameMetadata(db, 'RJ03333333', {
        title: 'Good C',
        circle: 'C',
        releaseDate: '2025-01-01',
        genres: ['드라마'],
        coverImageUrl: null,
        workType: null,
      })

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = getManyGameMetadata(db, ['RJ01111111', 'RJ02222222', 'RJ03333333'])
      warn.mockRestore()

      expect(result.size).toBe(3)
      expect(result.get('RJ01111111')?.genres).toEqual(['액션'])
      expect(result.get('RJ02222222')?.title).toBe('Corrupted B')
      expect(result.get('RJ02222222')?.genres).toEqual([])
      expect(result.get('RJ03333333')?.genres).toEqual(['드라마'])
    })
  })

  describe('clearAllGameMetadata', () => {
    it('deletes every crawled metadata row', () => {
      saveGameMetadata(db, 'RJ01111111', {
        title: 'A',
        circle: 'A',
        releaseDate: '2025-01-01',
        genres: [],
        coverImageUrl: null,
        workType: null,
      })
      saveGameMetadata(db, 'RJ02222222', {
        title: 'B',
        circle: 'B',
        releaseDate: '2025-01-01',
        genres: [],
        coverImageUrl: null,
        workType: null,
      })

      clearAllGameMetadata(db)

      expect(getGameMetadata(db, 'RJ01111111')).toBeUndefined()
      expect(getGameMetadata(db, 'RJ02222222')).toBeUndefined()
    })

    it('does not touch game_user_data (favorites/ratings/playtime are not cache)', () => {
      saveGameMetadata(db, 'RJ01111111', {
        title: 'A',
        circle: 'A',
        releaseDate: '2025-01-01',
        genres: [],
        coverImageUrl: null,
        workType: null,
      })
      setFavorite(db, 'RJ01111111', 'code', true)

      clearAllGameMetadata(db)

      expect(getGameUserData(db, 'RJ01111111')?.isFavorite).toBe(true)
    })
  })

  describe('rewriteCoverImagePathPrefix', () => {
    it('rewrites a matching prefix on every affected row', () => {
      saveGameMetadata(db, 'RJ01111111', {
        title: 'A',
        circle: 'A',
        releaseDate: '2025-01-01',
        genres: [],
        coverImageUrl: null,
        workType: null,
      })
      saveGameMetadata(db, 'RJ02222222', {
        title: 'B',
        circle: 'B',
        releaseDate: '2025-01-01',
        genres: [],
        coverImageUrl: null,
        workType: null,
      })
      setGameMetadataCoverPath(db, 'RJ01111111', 'C:\\old\\cache\\covers\\RJ01111111.webp')
      setGameMetadataCoverPath(db, 'RJ02222222', 'C:\\old\\cache\\covers\\RJ02222222.webp')

      rewriteCoverImagePathPrefix(db, 'C:\\old', 'C:\\new')

      expect(getGameMetadata(db, 'RJ01111111')?.coverImagePath).toBe(
        'C:\\new\\cache\\covers\\RJ01111111.webp'
      )
      expect(getGameMetadata(db, 'RJ02222222')?.coverImagePath).toBe(
        'C:\\new\\cache\\covers\\RJ02222222.webp'
      )
    })

    it('leaves a row with no cover image path alone', () => {
      saveGameMetadata(db, 'RJ01111111', {
        title: 'A',
        circle: 'A',
        releaseDate: '2025-01-01',
        genres: [],
        coverImageUrl: null,
        workType: null,
      })

      expect(() => rewriteCoverImagePathPrefix(db, 'C:\\old', 'C:\\new')).not.toThrow()
      expect(getGameMetadata(db, 'RJ01111111')?.coverImagePath).toBeNull()
    })

    it('leaves a row whose path does not start with the old prefix alone', () => {
      saveGameMetadata(db, 'RJ01111111', {
        title: 'A',
        circle: 'A',
        releaseDate: '2025-01-01',
        genres: [],
        coverImageUrl: null,
        workType: null,
      })
      setGameMetadataCoverPath(db, 'RJ01111111', 'C:\\unrelated\\RJ01111111.webp')

      rewriteCoverImagePathPrefix(db, 'C:\\old', 'C:\\new')

      expect(getGameMetadata(db, 'RJ01111111')?.coverImagePath).toBe(
        'C:\\unrelated\\RJ01111111.webp'
      )
    })

    it('is a no-op when oldPrefix and newPrefix are the same', () => {
      saveGameMetadata(db, 'RJ01111111', {
        title: 'A',
        circle: 'A',
        releaseDate: '2025-01-01',
        genres: [],
        coverImageUrl: null,
        workType: null,
      })
      setGameMetadataCoverPath(db, 'RJ01111111', 'C:\\same\\RJ01111111.webp')

      rewriteCoverImagePathPrefix(db, 'C:\\same', 'C:\\same')

      expect(getGameMetadata(db, 'RJ01111111')?.coverImagePath).toBe('C:\\same\\RJ01111111.webp')
    })
  })

  describe('listAllGameMetadataCodes', () => {
    it('returns an empty array when nothing has been crawled yet', () => {
      expect(listAllGameMetadataCodes(db)).toEqual([])
    })

    it('returns every code that has a game_metadata row', () => {
      saveGameMetadata(db, 'RJ01111111', {
        title: 'A',
        circle: 'A',
        releaseDate: '2025-01-01',
        genres: [],
        coverImageUrl: null,
        workType: null,
      })
      saveGameMetadata(db, 'VJ02222222', {
        title: 'B',
        circle: 'B',
        releaseDate: '2025-02-02',
        genres: [],
        coverImageUrl: null,
        workType: null,
      })

      expect(listAllGameMetadataCodes(db).sort()).toEqual(['RJ01111111', 'VJ02222222'])
    })
  })
})
