import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS, MediaSyncStateSchema } from '../../../shared/types/ipc'
import { installZoomInShortcut } from '../zoomShortcuts'
import { setMediaHardwareKeysActive } from '../mediaHardwareKeys'

// Detached video playback lives in its own BrowserWindow (see
// FullscreenVideoOverlay's "새 창으로 분리" button) - only one at a time; a
// second detach request just focuses the existing one instead of opening a
// duplicate.
let playerWindow: BrowserWindow | null = null

// Updated on every MEDIA_STATE_BROADCAST (which fires whenever the sync DTO
// actually changes in whichever window is currently active, not only when a
// detached window exists - see useMediaPlayerSync.ts/sameMediaSyncState) -
// isPlaying is itself a DTO field, so this stays correct even though P3
// stopped broadcasting on every store change. Lets the main process's
// Reload menu handler (electron/main/index.ts) know whether to warn before
// reloading, without a dedicated IPC round-trip.
let isMediaPlaying = false

export function getIsMediaPlaying(): boolean {
  return isMediaPlaying
}

// A reload wipes the guarded window's renderer (and its store) back to
// isPlaying: false, but that never broadcasts on its own - Zustand's
// subscribe only fires on change, and a fresh store starting at `false`
// isn't one. Without this, isMediaPlaying stays stuck true after the exact
// reload it just allowed, so the very next Reload attempt warns again with
// nothing actually playing. Called from index.ts's guardedReload right
// before it reloads.
export function clearIsMediaPlaying(): void {
  isMediaPlaying = false
}

export function registerMediaWindowHandlers(getMainWindow: () => BrowserWindow | null): {
  closePlayerWindow: () => void
} {
  ipcMain.handle(IPC_CHANNELS.MEDIA_OPEN_PLAYER_WINDOW, (_event, payload: unknown) => {
    const initialState = MediaSyncStateSchema.parse(payload)
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
    installZoomInShortcut(win.webContents)

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
      getMainWindow()?.webContents.send(IPC_CHANNELS.MEDIA_PLAYER_WINDOW_CLOSED)
    })

    playerWindow = win
  })

  // Fire-and-forget relay, not request/response (mirrors METADATA_BULK_
  // CRAWL_PROGRESS's own "no request/response schema" push-event pattern) -
  // whichever window changes the shared control-plane state broadcasts it,
  // this just forwards to every OTHER currently open window.
  ipcMain.on(IPC_CHANNELS.MEDIA_STATE_BROADCAST, (event, payload: unknown) => {
    // safeParse, not parse: this is an ipcMain.on listener, so a throw here
    // is an uncaught main-process exception (there's no invoke promise to
    // reject into, unlike MEDIA_OPEN_PLAYER_WINDOW's ipcMain.handle above,
    // where .parse() is fine as-is). A malformed broadcast just gets
    // dropped instead - matches MPV_SET_EQ_BAND's own established pattern
    // for this exact class of handler (see mpvHandlers.ts).
    const result = MediaSyncStateSchema.safeParse(payload)
    if (!result.success) return
    const state = result.data
    isMediaPlaying = state.isPlaying
    // Registered while a track is loaded regardless of play/pause state -
    // gating on isPlaying instead would mean the hardware Play key could
    // never resume a paused track, since the shortcut wouldn't even be
    // registered to receive it. See mediaHardwareKeys.ts's own comment for
    // why this needs to be un-registered at all rather than left on always.
    setMediaHardwareKeysActive(state.currentIndex !== null)
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.id !== event.sender.id) {
        win.webContents.send(IPC_CHANNELS.MEDIA_STATE_SYNC, state)
      }
    }
  })

  // A newly-opened detached window (or any window, in principle) can ask
  // every OTHER window to re-broadcast its current state - a backstop for
  // MEDIA_OPEN_PLAYER_WINDOW's own did-finish-load push above, which can
  // race a slow-to-mount renderer (see useMediaPlayerSync.ts's own comment
  // on why a one-shot push isn't fully reliable). Relayed with the same
  // "every window but the requester" exclusion as MEDIA_STATE_BROADCAST.
  ipcMain.on(IPC_CHANNELS.MEDIA_REQUEST_STATE_SYNC, (event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.id !== event.sender.id) {
        win.webContents.send(IPC_CHANNELS.MEDIA_STATE_SYNC_REQUESTED)
      }
    }
  })

  return {
    closePlayerWindow: () => playerWindow?.close(),
  }
}
