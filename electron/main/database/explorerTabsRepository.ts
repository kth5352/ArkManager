import type { AppDatabase } from './client'
import { explorerTabs } from './schema'

export interface PersistedExplorerTab {
  id: string
  label: string
  path: string
  position: number
  isActive: boolean
  viewMode: 'list' | 'grid'
}

export function loadExplorerTabs(db: AppDatabase): PersistedExplorerTab[] {
  return db.select().from(explorerTabs).orderBy(explorerTabs.position).all()
}

// Full replace, not an upsert-by-id: the renderer always sends its complete,
// current tab list (including reorders/closes), so the persisted set should
// exactly mirror it rather than accumulating stale rows.
export function saveExplorerTabs(db: AppDatabase, tabs: PersistedExplorerTab[]): void {
  db.transaction((tx) => {
    tx.delete(explorerTabs).run()
    for (const tab of tabs) {
      tx.insert(explorerTabs).values(tab).run()
    }
  })
}
