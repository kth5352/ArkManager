import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC_CHANNELS, type UpdateStatus } from '../../shared/types/ipc'
import { normalizeReleaseNotes } from './normalizeReleaseNotes'

// Download as soon as an update is found (no extra "start download" click),
// but never install/restart on our own - quitAndInstall only ever runs from
// the renderer's own explicit "지금 재시작하고 설치" action (UPDATE_INSTALL
// below), so a download finishing never yanks the app out from under
// whatever the user is doing.
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = false
// Without this, GitHubProvider only ever returns the latest release's own
// notes (see normalizeReleaseNotes' comment) - the release-notes dialog is
// built to show one entry per skipped version, so this needs to actually be
// enabled for that to have real data to show once more than one release is
// published between two runs of the app.
autoUpdater.fullChangelog = true

// The most recent status any renderer has been sent, so a window that
// mounts (or remounts, e.g. navigating back to Settings) after a status
// change already happened - the silent startup check in particular runs
// with nothing listening yet - can ask for where things currently stand
// instead of only ever starting from 'idle'. Module-scoped rather than
// per-window since there's only ever one update lifecycle for the whole
// app, regardless of which window is currently open.
let lastStatus: UpdateStatus = { state: 'idle' }
const UPDATE_QUIT_ROLLBACK_MS = 5000

export function registerUpdateHandlers(
  getMainWindow: () => BrowserWindow | null,
  beginUpdateQuit: () => () => void
): void {
  let installAttemptPending = false

  const sendStatus = (status: UpdateStatus): void => {
    lastStatus = status
    getMainWindow()?.webContents.send(IPC_CHANNELS.UPDATE_STATUS, status)
  }

  autoUpdater.on('checking-for-update', () => sendStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    sendStatus({
      state: 'available',
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info),
    })
  )
  autoUpdater.on('update-not-available', () => sendStatus({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    sendStatus({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    sendStatus({
      state: 'downloaded',
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info),
    })
  )
  autoUpdater.on('error', (error) => sendStatus({ state: 'error', message: error.message }))

  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_VERSION, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_STATUS, () => lastStatus)

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
    if (lastStatus.state !== 'downloaded' || installAttemptPending) return

    const rollbackQuit = beginUpdateQuit()
    installAttemptPending = true
    const rollbackTimer = setTimeout(() => {
      installAttemptPending = false
      rollbackQuit()
    }, UPDATE_QUIT_ROLLBACK_MS)

    try {
      autoUpdater.quitAndInstall()
    } catch (error) {
      clearTimeout(rollbackTimer)
      installAttemptPending = false
      rollbackQuit()
      throw error
    }
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
