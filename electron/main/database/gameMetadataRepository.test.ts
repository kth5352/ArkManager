import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import {
  getGameMetadata,
  saveGameMetadata,
  setGameMetadataCoverPath,
  getManyGameMetadata,
  rewriteCoverImagePathPrefix,
} from './gameMetadataRepository'

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
    })

    const row = getGameMetadata(db, 'RJ01169914')
    expect(row?.title).toBe('シニシスタ2 SiNiSistar2')
    expect(row?.genres).toEqual(['ドット', 'シスター'])
    expect(row?.coverImagePath).toBeNull()
  })

  it('sets the cover image path independently of the crawled text fields', () => {
    saveGameMetadata(db, 'RJ01169914', {
      title: 'Test',
      circle: 'Test Circle',
      releaseDate: '2025-01-01',
      genres: [],
      coverImageUrl: null,
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
    })
    saveGameMetadata(db, 'RJ02222222', {
      title: 'Game B',
      circle: 'Circle B',
      releaseDate: '2025-02-02',
      genres: ['드라마'],
      coverImageUrl: null,
    })

    const result = getManyGameMetadata(db, ['RJ01111111', 'RJ02222222', 'RJ99999999'])
    expect(result.size).toBe(2)
    expect(result.get('RJ01111111')?.title).toBe('Game A')
    expect(result.has('RJ99999999')).toBe(false)
  })

  it('returns an empty map for an empty code list', () => {
    expect(getManyGameMetadata(db, []).size).toBe(0)
  })

  describe('rewriteCoverImagePathPrefix', () => {
    it('rewrites a matching prefix on every affected row', () => {
      saveGameMetadata(db, 'RJ01111111', {
        title: 'A',
        circle: 'A',
        releaseDate: '2025-01-01',
        genres: [],
        coverImageUrl: null,
      })
      saveGameMetadata(db, 'RJ02222222', {
        title: 'B',
        circle: 'B',
        releaseDate: '2025-01-01',
        genres: [],
        coverImageUrl: null,
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
      })
      setGameMetadataCoverPath(db, 'RJ01111111', 'C:\\same\\RJ01111111.webp')

      rewriteCoverImagePathPrefix(db, 'C:\\same', 'C:\\same')

      expect(getGameMetadata(db, 'RJ01111111')?.coverImagePath).toBe('C:\\same\\RJ01111111.webp')
    })
  })
})
