import { create } from 'zustand'

export interface ExplorerTab {
  id: string
  label: string
  path: string
}

interface ExplorerState {
  tabs: ExplorerTab[]
  activeTabId: string
  addTab: (tab: Omit<ExplorerTab, 'id'>) => void
  closeTab: (id: string) => void
  closeOtherTabs: (id: string) => void
  duplicateTab: (id: string) => void
  reorderTabs: (fromId: string, toId: string) => void
  setActiveTab: (id: string) => void
  navigateTab: (id: string, path: string) => void
}

function createTabId(): string {
  return crypto.randomUUID()
}

// No hardcoded default tabs - every machine has a different library layout,
// so guessing a path here (e.g. a developer's own drive letters) would just
// point most users at a folder that doesn't exist. First run starts empty;
// ExplorerPage shows an empty-state message until a tab is opened, and tabs
// are persisted from then on (see useExplorerTabsPersistence).
const initialTabs: ExplorerTab[] = []

export const useExplorerStore = create<ExplorerState>((set) => ({
  tabs: initialTabs,
  activeTabId: '',

  addTab: (tab) =>
    set((state) => {
      const id = createTabId()
      return { tabs: [...state.tabs, { ...tab, id }], activeTabId: id }
    }),

  closeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      const activeTabId = state.activeTabId === id ? (tabs[0]?.id ?? '') : state.activeTabId
      return { tabs, activeTabId }
    }),

  closeOtherTabs: (id) =>
    set((state) => ({ tabs: state.tabs.filter((tab) => tab.id === id), activeTabId: id })),

  duplicateTab: (id) =>
    set((state) => {
      const source = state.tabs.find((tab) => tab.id === id)
      if (!source) return state
      const newTab = { ...source, id: createTabId() }
      const index = state.tabs.findIndex((tab) => tab.id === id)
      const tabs = [...state.tabs]
      tabs.splice(index + 1, 0, newTab)
      return { tabs, activeTabId: newTab.id }
    }),

  reorderTabs: (fromId, toId) =>
    set((state) => {
      const fromIndex = state.tabs.findIndex((tab) => tab.id === fromId)
      const toIndex = state.tabs.findIndex((tab) => tab.id === toId)
      if (fromIndex === -1 || toIndex === -1) return state
      const tabs = [...state.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return { tabs }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  navigateTab: (id, path) =>
    set((state) => ({ tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, path } : tab)) })),
}))
