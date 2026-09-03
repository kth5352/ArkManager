import { BrowserWindow, ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  MpvLoadRequestSchema,
  MpvResizeRequestSchema,
  MpvSeekRequestSchema,
  MpvSetVolumeRequestSchema,
} from '../../../shared/types/ipc'
import * as mpv from '../media/mpvProcessManager'

export function registerMpvHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS.MPV_LOAD, (event, payload: unknown) => {
    const { filePath, isVideo } = MpvLoadRequestSchema.parse(payload)
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()
    if (!win) return
    mpv.setHostWindow(win)
    // 1280x720 is only the initial render size, used for the handful of
    // frames produced before the renderer's ResizeObserver reports the real
    // surface size (one debounce cycle after mount) via MPV_RESIZE.
    mpv.loadFile(filePath, 1280, 720, isVideo)
  })

  // Re-points frame delivery at the calling window without touching playback
  // - what a detach/reattach host switch needs (the video keeps playing in
  // the utility process throughout; only the MessagePort recipient changes).
  ipcMain.handle(IPC_CHANNELS.MPV_BECOME_HOST, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()
    if (!win) return
    mpv.setHostWindow(win)
  })

  // ipcMain.on, not .handle - the preload side fires this with
  // ipcRenderer.send on every debounced resize tick and never awaits it.
  ipcMain.on(IPC_CHANNELS.MPV_RESIZE, (_event, payload: unknown) => {
    const { width, height } = MpvResizeRequestSchema.parse(payload)
    mpv.resize(width, height)
  })

  ipcMain.handle(IPC_CHANNELS.MPV_PLAY, () => mpv.play())
  ipcMain.handle(IPC_CHANNELS.MPV_PAUSE, () => mpv.pause())

  ipcMain.handle(IPC_CHANNELS.MPV_SEEK, (_event, payload: unknown) => {
    const { seconds } = MpvSeekRequestSchema.parse(payload)
    mpv.seek(seconds)
  })

  ipcMain.handle(IPC_CHANNELS.MPV_SET_VOLUME, (_event, payload: unknown) => {
    const { volume } = MpvSetVolumeRequestSchema.parse(payload)
    mpv.setVolume(volume)
  })

  mpv.onWorkerMessage((msg) => {
    const m = msg as {
      type: string
      isPlaying?: boolean
      currentTime?: number
      duration?: number | null
    }
    if (m.type === 'state-update') {
      const win = mpv.getCurrentHostWindow()
      // The host window can be closed (or the whole app be quitting) while
      // the worker's ~4x/sec state push is still in flight - sending to a
      // destroyed window's webContents throws.
      if (!win || win.isDestroyed()) return
      win.webContents.send(IPC_CHANNELS.MPV_STATE_UPDATE, {
        isPlaying: m.isPlaying,
        currentTime: m.currentTime,
        duration: m.duration ?? null,
        error: null,
      })
    }
  })
}
