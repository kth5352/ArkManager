import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS, WindowFullscreenRequestSchema } from '../../../shared/types/ipc'
import {
  attachFullscreenController,
  type FullscreenController,
  type FullscreenWindowLike,
} from '../windowFullscreenOwner'

// One owner/controller per window.
const controllers = new WeakMap<BrowserWindow, FullscreenController>()

export function attachWindowFullscreen(win: BrowserWindow): void {
  if (!controllers.has(win))
    controllers.set(win, attachFullscreenController(win as unknown as FullscreenWindowLike))
}

export function registerWindowFullscreenHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_FULLSCREEN, (event, payload: unknown) => {
    const { fullscreen, reason } = WindowFullscreenRequestSchema.parse(payload)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return { fullscreen: false, owner: null }
    attachWindowFullscreen(win)
    return controllers.get(win)!.request(fullscreen, reason)
  })
}
