export const EXPLORER_TREE_WIDTH_MIN = 180
export const EXPLORER_TREE_WIDTH_MAX = 400
export const EXPLORER_TREE_WIDTH_DEFAULT = 240

export function clampExplorerTreeWidth(width: number): number {
  if (Number.isNaN(width)) return EXPLORER_TREE_WIDTH_DEFAULT
  return Math.min(EXPLORER_TREE_WIDTH_MAX, Math.max(EXPLORER_TREE_WIDTH_MIN, width))
}
