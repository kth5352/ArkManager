import { describe, it, expect } from 'vitest'
import {
  clampExplorerTreeWidth,
  EXPLORER_TREE_WIDTH_DEFAULT,
  EXPLORER_TREE_WIDTH_MAX,
  EXPLORER_TREE_WIDTH_MIN,
} from './clampExplorerTreeWidth'

describe('clampExplorerTreeWidth', () => {
  it('returns the value unchanged when within bounds', () => {
    expect(clampExplorerTreeWidth(300)).toBe(300)
  })

  it('clamps to the minimum when below it', () => {
    expect(clampExplorerTreeWidth(50)).toBe(EXPLORER_TREE_WIDTH_MIN)
  })

  it('clamps to the maximum when above it', () => {
    expect(clampExplorerTreeWidth(900)).toBe(EXPLORER_TREE_WIDTH_MAX)
  })

  it('falls back to the default for NaN', () => {
    expect(clampExplorerTreeWidth(Number.NaN)).toBe(EXPLORER_TREE_WIDTH_DEFAULT)
  })
})
