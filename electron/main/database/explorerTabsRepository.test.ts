import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { loadExplorerTabs, saveExplorerTabs } from './explorerTabsRepository'

describe('explorerTabsRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns an empty list when nothing was ever saved', () => {
    expect(loadExplorerTabs(db)).toEqual([])
  })

  it('saves and reloads tabs in position order', () => {
    saveExplorerTabs(db, [
      { id: 'a', label: 'A', path: 'D:\\A', position: 0, isActive: false },
      { id: 'b', label: 'B', path: 'D:\\B', position: 1, isActive: true },
    ])

    expect(loadExplorerTabs(db)).toEqual([
      { id: 'a', label: 'A', path: 'D:\\A', position: 0, isActive: false },
      { id: 'b', label: 'B', path: 'D:\\B', position: 1, isActive: true },
    ])
  })

  it('replaces the previous tab set entirely on each save (not additive)', () => {
    saveExplorerTabs(db, [{ id: 'a', label: 'A', path: 'D:\\A', position: 0, isActive: true }])
    saveExplorerTabs(db, [{ id: 'b', label: 'B', path: 'D:\\B', position: 0, isActive: true }])

    expect(loadExplorerTabs(db)).toEqual([
      { id: 'b', label: 'B', path: 'D:\\B', position: 0, isActive: true },
    ])
  })
})
