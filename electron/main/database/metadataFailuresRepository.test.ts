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

  // Locks in a pre-existing, deliberate behavior this D4 fix must not
  // tighten: getMetadataFailure validates the parsed value is an array (via
  // Array.isArray, not a stricter isStringArray-style check) and THEN
  // filters non-string elements out per-element, rather than discarding the
  // whole array the moment one element isn't a string.
  it('keeps the string elements of a valid-but-mixed-shape array instead of discarding the whole thing', () => {
    saveMetadataFailure(db, 'RJ08888888', ['dlsite-html'], 'parse')
    db.update(metadataFailures)
      .set({ attemptedSources: JSON.stringify(['dlsite-html', 123, 'dlsite-json', null]) })
      .where(eq(metadataFailures.code, 'RJ08888888'))
      .run()

    expect(getMetadataFailure(db, 'RJ08888888')?.attemptedSources).toEqual([
      'dlsite-html',
      'dlsite-json',
    ])
  })
})
