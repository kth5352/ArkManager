import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { getGameMetadata, touchGameMetadata } from './gameMetadataRepository'

describe('gameMetadataRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns undefined when no metadata was ever recorded for a code', () => {
    expect(getGameMetadata(db, 'RJ01234567')).toBeUndefined()
  })

  it('creates a row on first touch and returns it', () => {
    touchGameMetadata(db, 'RJ01234567')
    const row = getGameMetadata(db, 'RJ01234567')
    expect(row?.code).toBe('RJ01234567')
    expect(typeof row?.createdAt).toBe('string')
    expect(row?.createdAt).toBe(row?.updatedAt)
  })

  it('updates updatedAt (but not createdAt) on a second touch', async () => {
    touchGameMetadata(db, 'RJ01234567')
    const first = getGameMetadata(db, 'RJ01234567')

    await new Promise((resolve) => setTimeout(resolve, 1))
    touchGameMetadata(db, 'RJ01234567')
    const second = getGameMetadata(db, 'RJ01234567')

    expect(second?.createdAt).toBe(first?.createdAt)
    expect(second?.updatedAt).not.toBe(first?.updatedAt)
  })

  it('keeps different codes independent', () => {
    touchGameMetadata(db, 'RJ01234567')
    touchGameMetadata(db, 'VJ01004728')

    expect(getGameMetadata(db, 'RJ01234567')?.code).toBe('RJ01234567')
    expect(getGameMetadata(db, 'VJ01004728')?.code).toBe('VJ01004728')
  })
})
