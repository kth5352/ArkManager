import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
import { IPC_CHANNELS } from '../../shared/types/ipc'
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
import { registerCacheHandlers } from './ipc/cacheHandlers'
import {
  registerMediaWindowHandlers,
  getIsMediaPlaying,
  clearIsMediaPlaying,
} from './ipc/mediaWindowHandlers'
import { registerMediaThumbnailHandlers } from './ipc/mediaThumbnailHandlers'
import { registerMediaLyricsHandlers } from './ipc/mediaLyricsHandlers'
import { registerExcludedEntriesHandlers } from './ipc/excludedEntriesHandlers'
import { registerUpdateHandlers, checkForUpdatesOnStartup } from './updater'
import { getActiveSessions } from './launch/activeSessions'
import { recordPlaySession } from './database/gameUserDataRepository'
import { rewriteCoverImagePathPrefix } from './database/gameMetadataRepository'
import { migrateUserDataFolder, NEW_DB_FILENAME } from './migrateUserDataFolder'
import {
  registerThumbnailProtocolHandler,
  registerThumbnailProtocolScheme,
} from './thumbnailProtocol'
import { registerMediaProtocolHandler, registerMediaProtocolScheme } from './mediaProtocol'
import {
  registerMediaThumbnailProtocolHandler,
  registerMediaThumbnailProtocolScheme,
} from './mediaThumbnailProtocol'

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
  let closePlayerWindow: (() => void) | null = null

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  // Must happen before app.whenReady() - Electron requires privileged scheme
  // registration at module load time.
  registerThumbnailProtocolScheme()
  registerMediaProtocolScheme()
  registerMediaThumbnailProtocolScheme()

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

  // Shows a confirm dialog before Reload/Force Reload if media is currently
  // playing, since a reload wipes the renderer (and with it, in-progress
  // playback) with no way back. clearIsMediaPlaying() resets the flag
  // reload itself is guarding on - without it, a reload the user just
  // confirmed leaves the main process still believing media is playing (the
  // freshly-reloaded renderer starts at isPlaying: false, but that never
  // broadcasts on its own, since Zustand's subscribe only fires on change),
  // so the very next Reload attempt would warn again over nothing.
  function guardedReload(win: BrowserWindow, forceReload: boolean): void {
    const doReload = (): void => {
      clearIsMediaPlaying()
      if (forceReload) win.webContents.reloadIgnoringCache()
      else win.webContents.reload()
    }
    if (!getIsMediaPlaying()) {
      doReload()
      return
    }
    dialog
      .showMessageBox(win, {
        type: 'question',
        buttons: ['취소', '새로고침'],
        defaultId: 0,
        cancelId: 0,
        message: '미디어가 재생 중입니다. 새로고침하면 재생이 중단됩니다. 계속하시겠습니까?',
      })
      .then(({ response }) => {
        if (response === 1) doReload()
      })
      .catch(() => {
        // The parent window can be destroyed while the modal is still open
        // (e.g. app quit mid-dialog) - showMessageBox then rejects. Nothing
        // to reload at that point, so there's nothing to do here beyond not
        // leaving this as an unhandled rejection.
      })
  }

  // Reproduces Electron's own default menu shape (the one silently in
  // effect until now, since this app never called Menu.setApplicationMenu)
  // via the same role shorthand for File/Edit - View and Window are both
  // spelled out item-by-item: View so its two reload items can get a custom
  // click handler instead of role: 'reload' / role: 'forceReload' (every
  // other View item unchanged), Window so its Close item can drop the
  // native CmdOrCtrl+W accelerator that would otherwise fight
  // TabBar.tsx's own Ctrl+W handler (see the Window submenu's own comment
  // below). The default's Help menu (a single "Learn More" link to
  // electronjs.org) is deliberately dropped rather than reproduced - it has
  // no relevance to this app and an empty Help menu would be worse than no
  // Help menu at all. File/Edit/the non-reload View items/Window's
  // Minimize+Zoom stay English (Electron's own role-derived defaults, same
  // as before this menu existed) - only the items this app actually added
  // custom behavior to get Korean labels, matching the confirm dialog they
  // open (guardedReload, for the reload pair) or this codebase's
  // main-process convention of hardcoded Korean for anything genuinely
  // app-specific (see saveHandlers.ts's error strings). Window's Close item
  // itself stays English too, matching its role-derived label before this
  // fix (it's stripped of its accelerator, not given new behavior).
  function buildApplicationMenu(): void {
    const template: MenuItemConstructorOptions[] = [
      { role: 'fileMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          {
            label: '새로고침',
            accelerator: 'CmdOrCtrl+R',
            click: (_item, win) => {
              if (win instanceof BrowserWindow) guardedReload(win, false)
            },
          },
          {
            label: '강제 새로고침',
            accelerator: 'CmdOrCtrl+Shift+R',
            click: (_item, win) => {
              if (win instanceof BrowserWindow) guardedReload(win, true)
            },
          },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          { type: 'separator' },
          {
            label: '제외 항목 관리...',
            // Unlike the reload items above, this always targets mainWindow
            // specifically rather than whichever window is focused - the
            // dialog it opens only exists in the main window's renderer
            // (AppLayout), never in the detached player window (which loads
            // PlayerWindowPage instead and has no ExcludedEntriesDialog
            // mounted to receive this). Electron shares one application
            // menu across every window by default (no per-window setMenu
            // call exists for the player window), so this item is reachable
            // from there too - sending to the focused window would then
            // silently do nothing.
            click: () => {
              if (!mainWindow) return
              if (mainWindow.isMinimized()) mainWindow.restore()
              mainWindow.focus()
              mainWindow.webContents.send(IPC_CHANNELS.MENU_OPEN_EXCLUDED_ENTRIES_DIALOG)
            },
          },
        ],
      },
      {
        // Not role: 'windowMenu' - its default Close item is the one that
        // actually binds CmdOrCtrl+W (confirmed via a live menu dump; an
        // earlier attempt at this fix wrongly targeted role: 'fileMenu'
        // instead, whose own Windows default is just "Exit" with no
        // accelerator at all). That native accelerator fires independently
        // of, and wins over, TabBar.tsx's own Ctrl+W keydown listener
        // (closes the active Explorer tab). Spelling Window out item-by-item
        // (same treatment View already gets above) keeps Minimize/Zoom's own
        // defaults but drops Close's accelerator entirely, leaving Ctrl+W
        // solely to the renderer.
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          {
            label: 'Close',
            click: (_item, win) => {
              if (win instanceof BrowserWindow) win.close()
            },
          },
        ],
      },
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
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

    // Renderer console.* calls don't reach this process's own stdout by
    // default, which makes a renderer-side crash (e.g. a blank white
    // window) invisible outside of manually opening DevTools. Forwarding it
    // here means `npm run dev`'s own terminal output is enough to diagnose
    // one. Dev-only - a packaged build's users shouldn't see this noise.
    if (!app.isPackaged) {
      win.webContents.on('console-message', (details) => {
        console.log(
          `[renderer:${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`
        )
      })
      win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        console.log(`[renderer] did-fail-load: ${errorCode} ${errorDescription}`)
      })
    }

    if (process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    mainWindow = win
    win.on('closed', () => {
      if (mainWindow === win) mainWindow = null
      // Closing the main window with a detached player still open would
      // otherwise strand it as the only window left, with no way back to
      // the actual app (no tray icon, no way to reopen the main window on
      // Windows) - closing the app closes everything.
      closePlayerWindow?.()
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
    const oldUserDataPath = join(app.getPath('appData'), 'dlibrary')
    const newUserDataPath = app.getPath('userData')
    await migrateUserDataFolder(oldUserDataPath, newUserDataPath)

    const dbPath = join(newUserDataPath, NEW_DB_FILENAME)
    const db = createDbClient(dbPath)
    // Moving the cached cover-image files (above) doesn't rewrite the
    // absolute paths already stored in game_metadata pointing at them - see
    // rewriteCoverImagePathPrefix's own comment for why this silently broke
    // more than just the cover image for anything crawled before a rename.
    rewriteCoverImagePathPrefix(db, oldUserDataPath, newUserDataPath)
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
    registerCacheHandlers(db)
    registerThumbnailProtocolHandler(db)
    registerMediaProtocolHandler(db)
    registerMediaThumbnailProtocolHandler(db)
    closePlayerWindow = registerMediaWindowHandlers(() => mainWindow).closePlayerWindow
    registerMediaThumbnailHandlers(db)
    registerMediaLyricsHandlers(db)
    registerExcludedEntriesHandlers(db)
    registerUpdateHandlers(() => mainWindow)

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

    buildApplicationMenu()
    createWindow()

    // Delayed so it never competes with the window's own initial load for
    // network/CPU - a background check the user never asked for shouldn't
    // be what makes first launch feel slow.
    setTimeout(checkForUpdatesOnStartup, 3000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
