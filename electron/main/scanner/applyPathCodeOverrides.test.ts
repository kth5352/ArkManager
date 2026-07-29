import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from '../database/client'
import { setPathCodeOverride } from '../database/pathCodeOverridesRepository'
import { applyPathCodeOverrides } from './applyPathCodeOverrides'
import type { ScannedEntry } from '../../../shared/types/scanner'

function makeEntry(overrides: Partial<ScannedEntry> = {}): ScannedEntry {
  return {
    name: 'some-folder',
    path: 'D:\\games\\some-folder',
    kind: 'folder',
    mtimeMs: 0,
    size: 0,
    code: null,
    ...overrides,
  }
}

describe('applyPathCodeOverrides', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('leaves entries with no override untouched', () => {
    const entries = [makeEntry()]
    const result = applyPathCodeOverrides(db, entries)
    expect(result[0]?.code).toBeNull()
  })

  it('fills in code from an override, matching case-insensitively via normalization', () => {
    setPathCodeOverride(db, 'd:\\games\\some-folder', 'RJ01234567')
    const entries = [makeEntry({ path: 'D:\\games\\some-folder' })]
    const result = applyPathCodeOverrides(db, entries)
    expect(result[0]?.code).toEqual({ type: 'RJ', value: 'RJ01234567' })
  })

  it('never overrides an entry that already has a code from its filename', () => {
    setPathCodeOverride(db, 'd:\\games\\some-folder', 'RJ09999999')
    const entries = [makeEntry({ code: { type: 'RJ', value: 'RJ01234567' } })]
    const result = applyPathCodeOverrides(db, entries)
    expect(result[0]?.code?.value).toBe('RJ01234567')
  })
})
