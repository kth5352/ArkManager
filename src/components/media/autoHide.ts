export const AUTO_HIDE_DELAY_MS = 2000

export interface HoldReasons {
  pointerOverControls: boolean
  dragging: boolean
  paused: boolean
  sidebarOpen: boolean
  popoverOpen: boolean
  focusInControls: boolean
}

export function isHeld(hold: HoldReasons): boolean {
  return (
    hold.pointerOverControls ||
    hold.dragging ||
    hold.paused ||
    hold.sidebarOpen ||
    hold.popoverOpen ||
    hold.focusInControls
  )
}

export function shouldShowControls(
  now: number,
  lastActivityAt: number,
  hold: HoldReasons
): boolean {
  return isHeld(hold) || now - lastActivityAt < AUTO_HIDE_DELAY_MS
}

// Milliseconds until the controls should hide, or null when nothing needs
// scheduling (held open, or already past the delay).
export function nextHideDelayMs(
  now: number,
  lastActivityAt: number,
  hold: HoldReasons
): number | null {
  if (isHeld(hold)) return null
  const remaining = AUTO_HIDE_DELAY_MS - (now - lastActivityAt)
  return remaining > 0 ? remaining : null
}
