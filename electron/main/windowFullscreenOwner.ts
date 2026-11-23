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
    reason: 'media-toggle' | 'media-release'
  ) => WindowFullscreenChangedPayload
  owner: () => FullscreenOwner
}

export function attachFullscreenController(win: FullscreenWindowLike): FullscreenController {
  const owner = createFullscreenOwner()
  // Set when our own setFullScreen(true) is in flight, so the resulting
  // enter-full-screen event is attributed to media rather than the user.
  let pendingMedia = false

  const state = (): WindowFullscreenChangedPayload => ({
    fullscreen: win.isDestroyed() ? false : win.isFullScreen(),
    owner: owner.owner(),
  })

  win.on('enter-full-screen', () => {
    owner.onEnter(pendingMedia)
    pendingMedia = false
    if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.WINDOW_FULLSCREEN_CHANGED, state())
  })
  win.on('leave-full-screen', () => {
    owner.onLeave()
    pendingMedia = false
    if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.WINDOW_FULLSCREEN_CHANGED, state())
  })

  return {
    owner: owner.owner,
    request: (fullscreen, reason) => {
      if (win.isDestroyed() || !win.isFullScreenable()) return state()
      if (fullscreen) {
        if (!win.isFullScreen()) {
          pendingMedia = true
          win.setFullScreen(true)
        }
      } else if (win.isFullScreen()) {
        if (reason === 'media-toggle' || owner.shouldRelease()) win.setFullScreen(false)
      }
      return state()
    },
  }
}
