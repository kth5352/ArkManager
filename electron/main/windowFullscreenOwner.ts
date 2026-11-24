import { IPC_CHANNELS, type WindowFullscreenChangedPayload } from '../../shared/types/ipc'

export type FullscreenOwner = 'media' | 'user' | null

// Tracks who put a window into fullscreen so a media "release" (minimize,
// playback end, detach) only undoes fullscreen the media UI itself started.
export function createFullscreenOwner(): {
  onEnter: (byMedia: boolean) => void
  onLeave: () => void
  shouldRelease: () => boolean
  owner: () => FullscreenOwner
} {
  let current: FullscreenOwner = null
  return {
    onEnter: (byMedia) => {
      current = byMedia ? 'media' : 'user'
    },
    onLeave: () => {
      current = null
    },
    shouldRelease: () => current === 'media',
    owner: () => current,
  }
}

// The subset of BrowserWindow the controller needs (keeps it testable).
export interface FullscreenWindowLike {
  isFullScreen: () => boolean
  isFullScreenable: () => boolean
  isDestroyed: () => boolean
  setFullScreen: (flag: boolean) => void
  on: (event: 'enter-full-screen' | 'leave-full-screen', listener: () => void) => unknown
  webContents: { send: (channel: string, payload: unknown) => void }
}

export interface FullscreenController {
  request: (
    fullscreen: boolean,
    reason: 'media-toggle' | 'media-flip' | 'media-release'
  ) => WindowFullscreenChangedPayload
  owner: () => FullscreenOwner
  state: () => WindowFullscreenChangedPayload
}

export interface FullscreenTimers {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

const PENDING_TIMEOUT_MS = 1000

export function attachFullscreenController(
  win: FullscreenWindowLike,
  timers: FullscreenTimers = { set: setTimeout, clear: (h) => clearTimeout(h as never) }
): FullscreenController {
  const owner = createFullscreenOwner()
  // Set when our own setFullScreen(true) is in flight, so the resulting
  // enter-full-screen event is attributed to media rather than the user.
  let pendingMedia = false
  let pendingTimer: unknown = null

  const clearPending = (): void => {
    pendingMedia = false
    if (pendingTimer !== null) timers.clear(pendingTimer)
    pendingTimer = null
  }

  const state = (): WindowFullscreenChangedPayload => ({
    fullscreen: win.isDestroyed() ? false : win.isFullScreen(),
    owner: owner.owner(),
  })

  win.on('enter-full-screen', () => {
    owner.onEnter(pendingMedia)
    clearPending()
    if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.WINDOW_FULLSCREEN_CHANGED, state())
  })
  win.on('leave-full-screen', () => {
    owner.onLeave()
    clearPending()
    if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.WINDOW_FULLSCREEN_CHANGED, state())
  })

  return {
    owner: owner.owner,
    state,
    request: (fullscreen, reason) => {
      if (win.isDestroyed() || !win.isFullScreenable()) return state()
      // 'media-flip' toggles from the REAL window state, so a renderer whose
      // view is stale (F11 before mount, getFullscreen not back yet) still flips.
      if (reason === 'media-flip') {
        fullscreen = !win.isFullScreen()
        reason = 'media-toggle'
      }
      if (fullscreen) {
        if (!win.isFullScreen()) {
          pendingMedia = true
          win.setFullScreen(true)
          if (!win.isFullScreen()) {
            // Refused: no enter event will ever arrive, so a stale flag must
            // not claim the user's next F11 for media.
            clearPending()
          } else if (pendingMedia && pendingTimer === null) {
            // Entered but the event has not been delivered yet: bound the wait.
            pendingTimer = timers.set(clearPending, PENDING_TIMEOUT_MS)
          }
        }
      } else if (win.isFullScreen()) {
        if (reason === 'media-toggle' || owner.shouldRelease()) win.setFullScreen(false)
      }
      return state()
    },
  }
}
