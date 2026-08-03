import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import {
  getMediaThumbnailOverride,
  setMediaThumbnailOverride,
} from './mediaThumbnailOverridesRepository'

describe('mediaThumbnailOverridesRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns null when no override exists for a path', () => {
    expect(getMediaThumbnailOverride(db, 'd:\\media\\song.mp3')).toBeNull()
  })

  it('stores and retrieves an override', () => {
    setMediaThumbnailOverride(db, 'd:\\media\\song.mp3', 'd:\\cache\\abc.webp')
    expect(getMediaThumbnailOverride(db, 'd:\\media\\song.mp3')).toBe('d:\\cache\\abc.webp')
  })

  it('overwrites an existing override for the same path', () => {
    setMediaThumbnailOverride(db, 'd:\\media\\song.mp3', 'd:\\cache\\abc.webp')
    setMediaThumbnailOverride(db, 'd:\\media\\song.mp3', 'd:\\cache\\def.webp')
    expect(getMediaThumbnailOverride(db, 'd:\\media\\song.mp3')).toBe('d:\\cache\\def.webp')
  })

  it('does not affect an override for a different path', () => {
    setMediaThumbnailOverride(db, 'd:\\media\\keep.mp3', 'd:\\cache\\keep.webp')
    setMediaThumbnailOverride(db, 'd:\\media\\other.mp3', 'd:\\cache\\other.webp')
    expect(getMediaThumbnailOverride(db, 'd:\\media\\keep.mp3')).toBe('d:\\cache\\keep.webp')
  })
})
