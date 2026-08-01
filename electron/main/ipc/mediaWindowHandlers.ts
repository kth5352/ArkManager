import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS, type MediaSyncState } from '../../../shared/types/ipc'

// Detached video playback lives in its own BrowserWindow (see
// FullscreenVideoOverlay's "새 창으로 분리" button) - only one at a time; a
// second detach request just focuses the existing one instead of opening a
// duplicate.
let playerWindow: BrowserWindow | null = null

// Only the currently-hosting window reports this (see MEDIA_REPORT_TIME
// below), a few times a second at most - kept as a plain variable here
// rather than broadcast to every window, so a detach/reattach handoff has a
// recent-enough seek position without flooding every window with
// continuous currentTime updates the way a full MediaSyncState broadcast
// would.
let lastKnownTimeSeconds = 0

export function registerMediaWindowHandlers(getMainWindow: () => BrowserWindow | null): {
  closePlayerWindow: () => void
} {
  ipcMain.handle(IPC_CHANNELS.MEDIA_OPEN_PLAYER_WINDOW, (_event, initialState: MediaSyncState) => {
    if (playerWindow) {
      playerWindow.focus()
      return
    }

    const win = new BrowserWindow({
      width: 960,
      height: 640,
      minWidth: 480,
      minHeight: 320,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
      },
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/player-window`)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/player-window' })
    }

    // The new window's own store starts empty (a fresh renderer process,
    // no shared memory with the main window) - hand it the exact state the
    // main window had at the moment of detaching, once it's actually ready
    // to receive it, rather than waiting for the next incidental change to
    // broadcast one.
    win.webContents.once('did-finish-load', () => {
      win.webContents.send(IPC_CHANNELS.MEDIA_STATE_SYNC, initialState)
    })

    win.on('closed', () => {
      playerWindow = null
      getMainWindow()?.webContents.send(
        IPC_CHANNELS.MEDIA_PLAYER_WINDOW_CLOSED,
        lastKnownTimeSeconds
      )
    })

    playerWindow = win
  })

  // Fire-and-forget relay, not request/response (mirrors METADATA_BULK_
  // CRAWL_PROGRESS's own "no request/response schema" push-event pattern) -
  // whichever window changes the shared control-plane state broadcasts it,
  // this just forwards to every OTHER currently open window.
  ipcMain.on(IPC_CHANNELS.MEDIA_STATE_BROADCAST, (event, state: MediaSyncState) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.id !== event.sender.id) {
        win.webContents.send(IPC_CHANNELS.MEDIA_STATE_SYNC, state)
      }
    }
  })

  ipcMain.on(IPC_CHANNELS.MEDIA_REPORT_TIME, (_event, seconds: number) => {
    lastKnownTimeSeconds = seconds
  })

  return {
    closePlayerWindow: () => playerWindow?.close(),
  }
}
