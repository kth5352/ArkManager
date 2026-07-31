import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { createDbClient } from './database/client'
import { registerSettingsHandlers } from './ipc/settingsHandlers'
import { registerLibrariesHandlers } from './ipc/librariesHandlers'
import { registerScannerHandlers } from './ipc/scannerHandlers'
import { registerExplorerHandlers } from './ipc/explorerHandlers'
import { registerSortHandlers } from './ipc/sortHandlers'
import { registerShellHandlers } from './ipc/shellHandlers'
import { registerMetadataHandlers } from './ipc/metadataHandlers'
import { registerGameUserDataHandlers } from './ipc/gameUserDataHandlers'
import { registerLaunchHandlers } from './ipc/launchHandlers'
import { registerSaveHandlers } from './ipc/saveHandlers'
import { getActiveSessions } from './launch/activeSessions'
import { recordPlaySession } from './database/gameUserDataRepository'
import {
  registerThumbnailProtocolHandler,
  registerThumbnailProtocolScheme,
} from './thumbnailProtocol'

// better-sqlite3 opens dlibrary.db with an exclusive file lock - a second
// launch (e.g. double-clicking the app's icon again) would otherwise either
// crash trying to open the same file or, worse, run a second independent
// writer against it. requestSingleInstanceLock() makes every launch after
// the first a no-op that just hands off to the already-running instance and
// exits immediately, before anything here ever touches the database file.
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  // Must happen before app.whenReady() - Electron requires privileged scheme
  // registration at module load time.
  registerThumbnailProtocolScheme()

  function createWindow(): void {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      // Sidebar is a fixed w-56 (224px); Gallery needs at least one card column
      // (CARD_WIDTH + GAP = 196px) plus the page's p-6 padding (48px) plus margin
      // for chrome/breathing room -> 224 + 196 + 48 = 468, rounded up to 720 for comfort.
      // 480 height comfortably fits the Sidebar's nav items and a card row plus title bar.
      minWidth: 720,
      minHeight: 480,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
      },
    })

    win.once('ready-to-show', () => win.show())

    if (process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    mainWindow = win
    win.on('closed', () => {
      if (mainWindow === win) mainWindow = null
    })
  }

  app.whenReady().then(() => {
    const dbPath = join(app.getPath('userData'), 'dlibrary.db')
    const db = createDbClient(dbPath)
    registerSettingsHandlers(db)
    registerLibrariesHandlers(db)
    registerScannerHandlers(db)
    registerExplorerHandlers(db)
    registerSortHandlers(db)
    registerShellHandlers()
    registerMetadataHandlers(db)
    registerGameUserDataHandlers(db)
    registerLaunchHandlers(db)
    registerSaveHandlers(db)
    registerThumbnailProtocolHandler(db)

    // A game launched via LAUNCH_GAME only persists its playtime after the
    // child process exits (see launchHandlers.ts) - if the app quits while a
    // game is still running, that promise never resolves and the whole
    // session would otherwise be lost. Flush whatever elapsed so far for any
    // still-running game before the process actually goes away.
    app.on('before-quit', () => {
      const now = Date.now()
      for (const session of getActiveSessions()) {
        recordPlaySession(db, session.key, session.keyType, now - session.startedAt)
      }
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
