// Pure helpers behind FullscreenPlayerView / PlayerControlBands - kept out of
// the components so they can be unit-tested without a DOM or mpv.
import type { HoldReasons } from './autoHide'

// Accent for the fullscreen bands (play button, sliders, progress line). A
// view may set --media-accent (e.g. from the cover colour); otherwise the
// app primary.
export const MEDIA_ACCENT = 'var(--media-accent, hsl(var(--primary)))'

export interface HoldInputs {
  pointerOverControls: boolean
  dragging: boolean
  isPlaying: boolean
  sidebarOpen: boolean
  popoverOpen: boolean
  focusInControls: boolean
}

// Spec §3.5: things that keep the control bands on screen.
export function deriveHoldReasons(input: HoldInputs): HoldReasons {
  return {
    pointerOverControls: input.pointerOverControls,
    dragging: input.dragging,
    paused: !input.isPlaying,
    sidebarOpen: input.sidebarOpen,
    popoverOpen: input.popoverOpen,
    focusInControls: input.focusInControls,
  }
}

export const LYRICS_HIDDEN_BOTTOM_PX = 24

// The lyric overlay rides right above the bottom band while it is shown and
// drops to the bottom edge when the bands hide.
export function lyricsBottomPx(bandsVisible: boolean, bandHeight: number): number {
  return bandsVisible ? Math.max(bandHeight, LYRICS_HIDDEN_BOTTOM_PX) : LYRICS_HIDDEN_BOTTOM_PX
}

// Share of the track played, for the thin progress line left while hidden.
export function progressFraction(currentTime: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.min(1, Math.max(0, currentTime / duration))
}

// A mouse click leaves focus on the clicked button; only keyboard-driven focus
// should hold the bands open, otherwise clicking any control would pin them
// forever. Engines without :focus-visible fall back to "keyboard focus".
export function isKeyboardFocus(el: { matches(selector: string): boolean } | null): boolean {
  if (!el) return false
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}
