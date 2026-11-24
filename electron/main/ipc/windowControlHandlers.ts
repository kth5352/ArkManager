import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS, WindowControlRequestSchema } from '../../../shared/types/ipc'

// Frameless windows (the detached player) draw their own minimize / maximize /
// close buttons; those call this. Only ever acts on the calling window.
export function registerWindowControlHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_CONTROL, (event, payload: unknown) => {
    const { action } = WindowControlRequestSchema.parse(payload)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return { maximized: false }
    if (action === 'minimize') win.minimize()
    else if (action === 'toggle-maximize') {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    } else if (action === 'close') win.close()
    return { maximized: win.isDestroyed() ? false : win.isMaximized() }
  })
}

// Keeps the renderer's maximize/restore icon right when the state changes by
// other routes (title double-click, Win+Up, snap).
export function attachMaximizedPush(win: BrowserWindow): void {
  const push = (maximized: boolean) => (): void => {
    if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, maximized)
  }
  win.on('maximize', push(true))
  win.on('unmaximize', push(false))
}
