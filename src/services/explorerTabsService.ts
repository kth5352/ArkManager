import type { PersistedExplorerTab } from '../../shared/types/ipc'

export function loadExplorerTabs(): Promise<PersistedExplorerTab[]> {
  return window.api.explorerTabs.load()
}

export function saveExplorerTabs(tabs: PersistedExplorerTab[]): Promise<void> {
  return window.api.explorerTabs.save(tabs)
}
