import { useEffect, useRef } from 'react'
import { useExplorerStore } from '../stores/explorerStore'
import { loadExplorerTabs, saveExplorerTabs } from '../services/explorerTabsService'

const SAVE_DEBOUNCE_MS = 500

// Hydrates useExplorerStore from SQLite on mount (falling back to the store's
// hardcoded initialTabs if nothing was ever saved), then persists every
// subsequent tab change back to SQLite, debounced so a drag-reorder or rapid
// tab actions don't trigger a write per intermediate state.
export function useExplorerTabsPersistence(): void {
  const hydratedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const snapshotAtMount = useExplorerStore.getState()

    loadExplorerTabs().then((persisted) => {
      if (cancelled) return
      // If the user already added/closed/reordered a tab during this async
      // load (zustand's getState() returns a new object reference on every
      // setState), the live store has already diverged from what was on
      // disk - applying the persisted snapshot now would silently discard
      // that in-flight action. Skip hydration in that case and let the
      // already-changed live state stand; it'll be what gets saved back by
      // the debounced-save effect below regardless.
      if (persisted.length > 0 && useExplorerStore.getState() === snapshotAtMount) {
        const tabs = [...persisted]
          .sort((a, b) => a.position - b.position)
          .map(({ id, label, path }) => ({ id, label, path }))
        const active = persisted.find((tab) => tab.isActive)
        useExplorerStore.setState({ tabs, activeTabId: active?.id ?? tabs[0].id })
      }
      hydratedRef.current = true
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const unsubscribe = useExplorerStore.subscribe((state) => {
      if (!hydratedRef.current) return
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        const payload = state.tabs.map((tab, index) => ({
          ...tab,
          position: index,
          isActive: tab.id === state.activeTabId,
        }))
        saveExplorerTabs(payload)
      }, SAVE_DEBOUNCE_MS)
    })

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      unsubscribe()
    }
  }, [])
}
