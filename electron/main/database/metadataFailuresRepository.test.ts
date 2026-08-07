import { beforeEach, describe, expect, it } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
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
})
