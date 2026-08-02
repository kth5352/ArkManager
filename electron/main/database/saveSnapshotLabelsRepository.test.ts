import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import {
  getSnapshotLabel,
  setSnapshotLabel,
  deleteSnapshotLabel,
  deleteSnapshotLabelsForKey,
} from './saveSnapshotLabelsRepository'

describe('saveSnapshotLabelsRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns nulls for a label that was never set', () => {
    expect(getSnapshotLabel(db, 'RJ01234567', 't1')).toEqual({ memo: null, version: null })
  })

  it('sets and reads back memo and version', () => {
    setSnapshotLabel(db, 'RJ01234567', 't1', { memo: '보스전 직전', version: '1.2.0' })
    expect(getSnapshotLabel(db, 'RJ01234567', 't1')).toEqual({
      memo: '보스전 직전',
      version: '1.2.0',
    })
  })

  it('updating one field does not clobber the other', () => {
    setSnapshotLabel(db, 'RJ01234567', 't1', { memo: '메모', version: '1.0.0' })
    setSnapshotLabel(db, 'RJ01234567', 't1', { memo: '수정된 메모' })
    expect(getSnapshotLabel(db, 'RJ01234567', 't1')).toEqual({
      memo: '수정된 메모',
      version: '1.0.0',
    })
  })

  it('labels are isolated per (key, timestamp) pair', () => {
    setSnapshotLabel(db, 'RJ01234567', 't1', { memo: 'A' })
    setSnapshotLabel(db, 'RJ01234567', 't2', { memo: 'B' })
    setSnapshotLabel(db, 'RJ09999999', 't1', { memo: 'C' })
    expect(getSnapshotLabel(db, 'RJ01234567', 't1').memo).toBe('A')
    expect(getSnapshotLabel(db, 'RJ01234567', 't2').memo).toBe('B')
    expect(getSnapshotLabel(db, 'RJ09999999', 't1').memo).toBe('C')
  })

  it('deleteSnapshotLabel removes only that one label', () => {
    setSnapshotLabel(db, 'RJ01234567', 't1', { memo: 'A' })
    setSnapshotLabel(db, 'RJ01234567', 't2', { memo: 'B' })
    deleteSnapshotLabel(db, 'RJ01234567', 't1')
    expect(getSnapshotLabel(db, 'RJ01234567', 't1')).toEqual({ memo: null, version: null })
    expect(getSnapshotLabel(db, 'RJ01234567', 't2').memo).toBe('B')
  })

  it('deleteSnapshotLabelsForKey removes every label for that key only', () => {
    setSnapshotLabel(db, 'RJ01234567', 't1', { memo: 'A' })
    setSnapshotLabel(db, 'RJ01234567', 't2', { memo: 'B' })
    setSnapshotLabel(db, 'RJ09999999', 't1', { memo: 'C' })
    deleteSnapshotLabelsForKey(db, 'RJ01234567')
    expect(getSnapshotLabel(db, 'RJ01234567', 't1')).toEqual({ memo: null, version: null })
    expect(getSnapshotLabel(db, 'RJ01234567', 't2')).toEqual({ memo: null, version: null })
    expect(getSnapshotLabel(db, 'RJ09999999', 't1').memo).toBe('C')
  })
})
