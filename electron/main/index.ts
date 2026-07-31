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
      sandbox: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
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
  registerThumbnailProtocolHandler()

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
