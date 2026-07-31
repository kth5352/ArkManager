export const SIDEBAR_WIDTH_MIN = 280
export const SIDEBAR_WIDTH_MAX = 520
export const SIDEBAR_WIDTH_DEFAULT = 320

export function clampSidebarWidth(width: number): number {
  if (Number.isNaN(width)) return SIDEBAR_WIDTH_DEFAULT
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width))
}
