import { describe, it, expect } from 'vitest'
import {
  navigateBrowseHistory,
  goBackInHistory,
  goForwardInHistory,
  resetBrowseHistory,
  type BrowseHistoryState,
} from './mediaBrowseHistory'

describe('resetBrowseHistory', () => {
  it('creates a fresh history with just the root path', () => {
    expect(resetBrowseHistory('C:\\Media\\Work')).toEqual({
      entries: ['C:\\Media\\Work'],
      index: 0,
    })
  })
})

describe('navigateBrowseHistory', () => {
  it('appends a new path and advances the index', () => {
    const start: BrowseHistoryState = { entries: ['A'], index: 0 }
    expect(navigateBrowseHistory(start, 'B')).toEqual({ entries: ['A', 'B'], index: 1 })
  })

  it('truncates forward history when navigating from a point after going back', () => {
    // A -> B -> C, then back to A (index 0), then navigate to D -
    // B and C should be discarded (standard browser-history semantics).
    const afterBack: BrowseHistoryState = { entries: ['A', 'B', 'C'], index: 0 }
    expect(navigateBrowseHistory(afterBack, 'D')).toEqual({ entries: ['A', 'D'], index: 1 })
  })

  it('is a no-op when navigating to the current path again', () => {
    const state: BrowseHistoryState = { entries: ['A', 'B'], index: 1 }
    expect(navigateBrowseHistory(state, 'B')).toEqual(state)
  })
})

describe('goBackInHistory', () => {
  it('moves the index back by one', () => {
    const state: BrowseHistoryState = { entries: ['A', 'B', 'C'], index: 2 }
    expect(goBackInHistory(state)).toEqual({ entries: ['A', 'B', 'C'], index: 1 })
  })

  it('is a no-op at index 0 (nothing to go back to)', () => {
    const state: BrowseHistoryState = { entries: ['A', 'B'], index: 0 }
    expect(goBackInHistory(state)).toEqual(state)
  })
})

describe('goForwardInHistory', () => {
  it('moves the index forward by one', () => {
    const state: BrowseHistoryState = { entries: ['A', 'B', 'C'], index: 0 }
    expect(goForwardInHistory(state)).toEqual({ entries: ['A', 'B', 'C'], index: 1 })
  })

  it('is a no-op at the last index (nothing to go forward to)', () => {
    const state: BrowseHistoryState = { entries: ['A', 'B'], index: 1 }
    expect(goForwardInHistory(state)).toEqual(state)
  })
})
