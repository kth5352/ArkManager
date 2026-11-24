import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS, WindowFullscreenRequestSchema } from '../../../shared/types/ipc'
import {
  attachFullscreenController,
  type FullscreenController,
  type FullscreenWindowLike,
} from '../windowFullscreenOwner'

// Typed adapter: the compiler checks every BrowserWindow method used here.
export function toFullscreenWindowLike(win: BrowserWindow): FullscreenWindowLike {
  return {
    isFullScreen: () => win.isFullScreen(),
    isFullScreenable: () => win.isFullScreenable(),
    isDestroyed: () => win.isDestroyed(),
    setFullScreen: (flag) => win.setFullScreen(flag),
    on: (event, listener) => {
      if (event === 'enter-full-screen') win.on('enter-full-screen', listener)
      else win.on('leave-full-screen', listener)
    },
    webContents: { send: (channel, payload) => win.webContents.send(channel, payload) },
  }
}

// One owner/controller per window.
const controllers = new WeakMap<BrowserWindow, FullscreenController>()

export function attachWindowFullscreen(win: BrowserWindow): void {
  if (!controllers.has(win))
    controllers.set(win, attachFullscreenController(toFullscreenWindowLike(win)))
}

export function registerWindowFullscreenHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_FULLSCREEN, (event, payload: unknown) => {
    const { fullscreen, reason } = WindowFullscreenRequestSchema.parse(payload)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return { fullscreen: false, owner: null }
    attachWindowFullscreen(win)
    return controllers.get(win)!.request(fullscreen, reason)
  })
  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_FULLSCREEN, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return { fullscreen: false, owner: null }
    attachWindowFullscreen(win)
    return controllers.get(win)!.state()
  })
}
