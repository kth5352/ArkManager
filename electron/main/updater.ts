import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC_CHANNELS, type UpdateStatus } from '../../shared/types/ipc'

// Download as soon as an update is found (no extra "start download" click),
// but never install/restart on our own - quitAndInstall only ever runs from
// the renderer's own explicit "지금 재시작하고 설치" action (UPDATE_INSTALL
// below), so a download finishing never yanks the app out from under
// whatever the user is doing.
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = false

export function registerUpdateHandlers(getMainWindow: () => BrowserWindow | null): void {
  const sendStatus = (status: UpdateStatus): void => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.UPDATE_STATUS, status)
  }

  autoUpdater.on('checking-for-update', () => sendStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    sendStatus({ state: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => sendStatus({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    sendStatus({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    sendStatus({ state: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (error) => sendStatus({ state: 'error', message: error.message }))

  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_VERSION, () => app.getVersion())

  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    // A dev run has no app-update.yml (only generated for a packaged
    // build) - checkForUpdates() would just throw. Reported as a plain
    // "no update" instead of surfacing a dev-only error to the renderer.
    if (!app.isPackaged) {
      sendStatus({ state: 'not-available' })
      return
    }
    await autoUpdater.checkForUpdates()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    autoUpdater.quitAndInstall()
  })
}

// Called once shortly after the main window is ready - a silent background
// check, not tied to any renderer action. No-ops outside a packaged build,
// same reasoning as UPDATE_CHECK above.
export function checkForUpdatesOnStartup(): void {
  if (!app.isPackaged) return
  autoUpdater.checkForUpdates().catch(() => {
    // Already reaches the renderer via the 'error' listener registered in
    // registerUpdateHandlers - this catch only exists so a rejected
    // promise here doesn't surface as an unhandled rejection in the main
    // process.
  })
}
