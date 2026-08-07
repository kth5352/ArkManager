import { describe, it, expect, beforeEach } from 'vitest'
import { useExplorerStore } from './explorerStore'

describe('useExplorerStore', () => {
  beforeEach(() => {
    useExplorerStore.setState({
      tabs: [
        { id: 'a', label: 'A', path: '/a', viewMode: 'list' },
        { id: 'b', label: 'B', path: '/b', viewMode: 'list' },
        { id: 'c', label: 'C', path: '/c', viewMode: 'list' },
      ],
      activeTabId: 'a',
    })
  })

  it('reorders tabs by moving one before another', () => {
    useExplorerStore.getState().reorderTabs('c', 'a')
    expect(useExplorerStore.getState().tabs.map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })

  it('closes a tab and activates the first remaining tab if it was active', () => {
    useExplorerStore.getState().closeTab('a')
    const state = useExplorerStore.getState()
    expect(state.tabs.map((t) => t.id)).toEqual(['b', 'c'])
    expect(state.activeTabId).toBe('b')
  })

  it('keeps the active tab unchanged when closing a non-active tab', () => {
    useExplorerStore.getState().closeTab('b')
    expect(useExplorerStore.getState().activeTabId).toBe('a')
  })

  it('duplicates a tab right after the original', () => {
    useExplorerStore.getState().duplicateTab('a')
    const tabs = useExplorerStore.getState().tabs
    expect(tabs[0].id).toBe('a')
    expect(tabs[1].path).toBe('/a')
    expect(tabs[1].id).not.toBe('a')
  })

  it('closeOtherTabs leaves only the target tab', () => {
    useExplorerStore.getState().closeOtherTabs('b')
    expect(useExplorerStore.getState().tabs.map((t) => t.id)).toEqual(['b'])
  })

  it('navigateTab updates only the target tab path', () => {
    useExplorerStore.getState().navigateTab('a', '/a/sub')
    const tabs = useExplorerStore.getState().tabs
    expect(tabs.find((t) => t.id === 'a')?.path).toBe('/a/sub')
    expect(tabs.find((t) => t.id === 'b')?.path).toBe('/b')
  })

  it('setViewMode updates only the target tab', () => {
    useExplorerStore.getState().setViewMode('a', 'grid')
    const tabs = useExplorerStore.getState().tabs
    expect(tabs.find((t) => t.id === 'a')?.viewMode).toBe('grid')
    expect(tabs.find((t) => t.id === 'b')?.viewMode).toBe('list')
  })
})
