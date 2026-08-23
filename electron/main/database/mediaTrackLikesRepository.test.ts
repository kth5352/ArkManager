import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { isTrackLiked, toggleTrackLike, listLikedTracks } from './mediaTrackLikesRepository'

describe('mediaTrackLikesRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('is not liked by default', () => {
    expect(isTrackLiked(db, 'C:/a.mp3')).toBe(false)
  })

  it('toggling likes then unlikes a track', () => {
    toggleTrackLike(db, 'C:/a.mp3', 'a.mp3')
    expect(isTrackLiked(db, 'C:/a.mp3')).toBe(true)
    toggleTrackLike(db, 'C:/a.mp3', 'a.mp3')
    expect(isTrackLiked(db, 'C:/a.mp3')).toBe(false)
  })

  it('lists liked tracks most-recently-liked first', () => {
    toggleTrackLike(db, 'C:/a.mp3', 'a.mp3')
    toggleTrackLike(db, 'C:/b.mp3', 'b.mp3')
    expect(listLikedTracks(db)).toEqual([{ path: 'C:/b.mp3' }, { path: 'C:/a.mp3' }])
  })
})
