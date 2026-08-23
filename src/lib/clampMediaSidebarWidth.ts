export const MEDIA_SIDEBAR_WIDTH_MIN = 240
export const MEDIA_SIDEBAR_WIDTH_MAX = 480
export const MEDIA_SIDEBAR_WIDTH_DEFAULT = 320

export function clampMediaSidebarWidth(width: number): number {
  if (Number.isNaN(width)) return MEDIA_SIDEBAR_WIDTH_DEFAULT
  return Math.min(MEDIA_SIDEBAR_WIDTH_MAX, Math.max(MEDIA_SIDEBAR_WIDTH_MIN, width))
}
