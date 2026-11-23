// Pure helpers behind useMediaPlayback's keyboard shortcuts and seek
// bookkeeping - kept out of the hook so they can be unit-tested without a
// DOM or a running mpv.

export const KEYBOARD_SEEK_STEP_S = 5
export const KEYBOARD_VOLUME_STEP = 0.05

// mpv's seek is asynchronous: the worker keeps pushing the PRE-seek
// time-pos (its periodic 250ms state push, see mpvWorker.ts) until the seek
// actually lands. Without this, a state push arriving between two quick
// arrow presses reset currentTime to the old position, so the second press
// seeked from there - repeated/held arrow keys jumped backwards or stalled.
// A reported time is ignored while a seek is pending unless it is already
// within SEEK_SETTLE_TOLERANCE_S of the target; the timeout keeps a seek mpv
// clamped elsewhere (e.g. past the end) from freezing the display forever.
export const SEEK_SETTLE_TOLERANCE_S = 1
export const SEEK_SETTLE_TIMEOUT_MS = 1500

export interface PendingSeek {
  target: number
  expiresAt: number
}

export function startPendingSeek(target: number, now: number): PendingSeek {
  return { target, expiresAt: now + SEEK_SETTLE_TIMEOUT_MS }
}

/** Position the next relative seek should start from. */
export function seekBase(currentTime: number, pending: PendingSeek | null, now: number): number {
  return pending && now < pending.expiresAt ? pending.target : currentTime
}

/**
 * Decides what to do with a time-pos pushed by mpv. `time` is null when the
 * report is a stale pre-seek value that must not overwrite the display.
 */
export function acceptReportedTime(
  reported: number,
  pending: PendingSeek | null,
  now: number
): { time: number | null; pending: PendingSeek | null } {
  if (!pending) return { time: reported, pending: null }
  const settled = Math.abs(reported - pending.target) <= SEEK_SETTLE_TOLERANCE_S
  if (settled || now >= pending.expiresAt) return { time: reported, pending: null }
  return { time: null, pending }
}

export function nextSeekTarget(base: number, delta: number, duration: number): number {
  // `duration` is 0 both before mpv's async loadfile resolves a real
  // duration and for a file mpv never reports one for - and 0 is a finite
  // number, so clamping to it would rewind every forward seek to the start.
  // Treat 0 as "unknown" and let the seek through unclamped.
  const max = duration > 0 ? duration : Infinity
  return Math.min(max, Math.max(0, base + delta))
}

export type MediaShortcut = 'seekBack' | 'seekForward' | 'volumeUp' | 'volumeDown' | 'togglePlay'

export interface ShortcutKeyEvent {
  key: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  defaultPrevented: boolean
}

export interface ShortcutFocusTarget {
  tagName: string
  isContentEditable: boolean
  type?: string
}

export function getMediaShortcut(
  event: ShortcutKeyEvent,
  focused: ShortcutFocusTarget | null
): MediaShortcut | null {
  // Already handled by a focused element (e.g. Explorer's Ctrl+Shift+ArrowUp
  // "move" shortcut), or a modified chord that belongs to someone else.
  if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return null

  if (focused) {
    const tag = focused.tagName
    // A range input (the seek bar / volume slider) is NOT a text field: its
    // native arrow handling moved the seek bar by 1s (step=1) and swallowed
    // Space, so the shortcuts silently changed meaning after the user merely
    // clicked a slider. The caller preventDefaults, so the native step does
    // not also run.
    const isRange = tag === 'INPUT' && focused.type === 'range'
    const isTextInput =
      (!isRange && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) || focused.isContentEditable
    if (isTextInput) return null
  }

  switch (event.key) {
    case 'ArrowLeft':
      return 'seekBack'
    case 'ArrowRight':
      return 'seekForward'
    case 'ArrowUp':
      return 'volumeUp'
    case 'ArrowDown':
      return 'volumeDown'
    case ' ': {
      // Space on a focused button/link activates it instead.
      const isButtonLike = !!focused && ['BUTTON', 'A'].includes(focused.tagName)
      return isButtonLike ? null : 'togglePlay'
    }
    default:
      return null
  }
}
