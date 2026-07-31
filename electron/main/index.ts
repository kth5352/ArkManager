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
import { migrateUserDataFolder, NEW_DB_FILENAME } from './migrateUserDataFolder'
import {
  registerThumbnailProtocolHandler,
  registerThumbnailProtocolScheme,
} from './thumbnailProtocol'

// better-sqlite3 opens this app's db file with an exclusive file lock - a second
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

  // Without this, the running window/taskbar icon falls back to Electron's
  // own generic icon even once build.icon (package.json) gives the packaged
  // .exe its own file icon - that build-time icon only ever applies to the
  // .exe file itself, not the BrowserWindow at runtime. LOGO.png isn't part
  // of the compiled out/ directory electron-vite produces, so a packaged
  // build needs its own copy shipped alongside the app - see this package's
  // build.extraResources, which copies it to process.resourcesPath. In dev,
  // __dirname is out/main, two levels up is the project root where the
  // source file actually lives.
  function resolveLogoPath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'LOGO.png')
      : join(__dirname, '../../LOGO.png')
  }

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
      icon: resolveLogoPath(),
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

  app.whenReady().then(async () => {
    // The app was renamed from "dlibrary" to "ark-manager" - Electron
    // derives userData's location from the app's own name, so an existing
    // install's registered libraries/ratings/cache would otherwise be
    // silently left behind under the old-named folder. Must run before
    // createDbClient ever opens a (possibly fresh, empty) db at the new
    // path - see migrateUserDataFolder.ts for why "does newPath exist" is
    // not itself a safe signal here.
    await migrateUserDataFolder(join(app.getPath('appData'), 'dlibrary'), app.getPath('userData'))

    const dbPath = join(app.getPath('userData'), NEW_DB_FILENAME)
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
