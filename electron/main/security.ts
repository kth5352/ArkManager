import { app, ipcMain, session, type BrowserWindowConstructorOptions } from 'electron'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

// Central place for Electron-level hardening. Nothing here changes what the
// app does for the user; it only shrinks what a compromised or tricked
// renderer (XSS via crawled text, a malicious media/subtitle file, a
// supply-chain-injected script, ...) can reach.

export interface TrustedOrigins {
  /** Dev server URL (ELECTRON_RENDERER_URL) or undefined when packaged. */
  rendererDevUrl?: string
  /** Absolute path of the packaged renderer entry (out/renderer/index.html). */
  rendererFile: string
}

function normalizeFsPath(p: string): string {
  return resolve(p).replace(/\\/g, '/').toLowerCase()
}

/**
 * True only for the app's own renderer document (any hash route of it).
 * Anything else - http(s), file:// pages elsewhere, data:, about:blank,
 * devtools://, a different localhost port - is untrusted.
 */
export function isTrustedAppUrl(rawUrl: string, trusted: TrustedOrigins): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  if (trusted.rendererDevUrl) {
    try {
      return url.origin === new URL(trusted.rendererDevUrl).origin
    } catch {
      return false
    }
  }

  if (url.protocol !== 'file:') return false
  // Reject UNC / remote-host file URLs (file://server/share/...).
  if (url.host !== '') return false
  try {
    return normalizeFsPath(fileURLToPath(url)) === normalizeFsPath(trusted.rendererFile)
  } catch {
    return false
  }
}

function currentTrustedOrigins(): TrustedOrigins {
  return {
    rendererDevUrl: app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'],
    rendererFile: join(__dirname, '../renderer/index.html'),
  }
}

/**
 * Wraps ipcMain.handle / ipcMain.on so every channel verifies that the
 * message comes from the top-level frame of the app's own renderer page.
 * Must run before any register*Handlers() call.
 */
export function installTrustedIpcGuard(): void {
  const originalHandle = ipcMain.handle.bind(ipcMain)
  const originalOn = ipcMain.on.bind(ipcMain)

  function isTrusted(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
    const frame = event.senderFrame
    if (!frame) return false
    if (frame.parent !== null) return false
    return isTrustedAppUrl(frame.url, currentTrustedOrigins())
  }

  ipcMain.handle = ((
    channel: string,
    listener: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown
  ) =>
    originalHandle(channel, (event, ...args) => {
      if (!isTrusted(event)) {
        throw new Error(`Blocked IPC call to "${channel}" from an untrusted frame.`)
      }
      return listener(event, ...args)
    })) as typeof ipcMain.handle

  ipcMain.on = ((
    channel: string,
    listener: (event: Electron.IpcMainEvent, ...args: unknown[]) => void
  ) =>
    originalOn(channel, (event, ...args) => {
      if (!isTrusted(event)) {
        // A sendSync caller would otherwise hang waiting for returnValue.
        event.returnValue = null
        return
      }
      listener(event, ...args)
    })) as typeof ipcMain.on
}

/**
 * Locks every WebContents (main window, player window, subtitle PIP, and any
 * future one) to the app's own page: no window.open, no navigation away, no
 * <webview>.
 */
export function installWebContentsLockdown(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))

    const blockUntrustedNavigation = (event: Electron.Event, url: string): void => {
      if (!isTrustedAppUrl(url, currentTrustedOrigins())) event.preventDefault()
    }
    contents.on('will-navigate', blockUntrustedNavigation)
    contents.on('will-redirect', blockUntrustedNavigation)
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })
}

/** The app needs no device/OS permission except writing text to the clipboard. */
export function installPermissionLockdown(): void {
  const allowed = new Set(['clipboard-sanitized-write'])
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(allowed.has(permission))
  })
  ses.setPermissionCheckHandler((_contents, permission) => allowed.has(permission))
  ses.setDevicePermissionHandler(() => false)
}

/** Explicit (instead of relying on defaults) so a future change can't silently weaken them. */
export function secureWebPreferences(
  preloadPath: string
): NonNullable<BrowserWindowConstructorOptions['webPreferences']> {
  return {
    preload: preloadPath,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    experimentalFeatures: false,
    enableBlinkFeatures: '',
  }
}
