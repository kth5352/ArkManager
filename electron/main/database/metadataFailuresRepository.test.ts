import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDbClient, type AppDatabase } from './client'
import { metadataFailures } from './schema'
import {
  clearMetadataFailure,
  getMetadataFailure,
  saveMetadataFailure,
} from './metadataFailuresRepository'

describe('metadataFailuresRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('saves, replaces, reads, and clears metadata failure state', () => {
    saveMetadataFailure(db, 'RJ01494021', ['dlsite-html'], 'blocked')
    expect(getMetadataFailure(db, 'RJ01494021')).toMatchObject({
      code: 'RJ01494021',
      attemptedSources: ['dlsite-html'],
      reason: 'blocked',
    })

    saveMetadataFailure(db, 'RJ01494021', ['dlsite-html', 'dlsite-json'], 'parse')
    expect(getMetadataFailure(db, 'RJ01494021')?.attemptedSources).toEqual([
      'dlsite-html',
      'dlsite-json',
    ])

    clearMetadataFailure(db, 'RJ01494021')
    expect(getMetadataFailure(db, 'RJ01494021')).toBeUndefined()
  })

  // D4 (performance-reliability plan): attemptedSources is a free-text DB
  // column holding a JSON string, not validated on write beyond
  // JSON.stringify's own output. Simulated by writing an invalid value
  // directly to the column after a normal save, never against the real
  // user DB.
  it('falls back to an empty attemptedSources array (not a thrown error) for syntactically invalid JSON', () => {
    saveMetadataFailure(db, 'RJ09999999', ['dlsite-html'], 'blocked')
    db.update(metadataFailures)
      .set({ attemptedSources: '{not valid json' })
      .where(eq(metadataFailures.code, 'RJ09999999'))
      .run()

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const row = getMetadataFailure(db, 'RJ09999999')
    warn.mockRestore()

    expect(row?.attemptedSources).toEqual([])
    expect(row?.reason).toBe('blocked')
  })
})
