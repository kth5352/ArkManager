import { extname } from 'node:path'

// shell.openPath() hands the file to Windows' default handler - for an .exe,
// .lnk, .bat, .js, .hta ... that means *running it*. Library folders are full
// of files that came out of downloaded archives, so these types are never
// opened silently: the main process asks the user first (a compromised
// renderer cannot answer that dialog).
const RISKY_EXTENSIONS = new Set([
  '.exe', '.com', '.scr', '.pif', '.msi', '.msp', '.msc', '.bat', '.cmd', '.ps1', '.psm1',
  '.psd1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.hta', '.lnk', '.url', '.reg',
  '.cpl', '.jar', '.dll', '.sys', '.inf', '.scf', '.gadget', '.application', '.appref-ms',
  '.settingcontent-ms', '.chm', '.xll', '.wll', '.docm', '.xlsm', '.pptm', '.iso', '.img',
  '.vhd', '.vhdx', '.appx', '.appxbundle', '.msix', '.msixbundle', '.diagcab', '.library-ms',
  '.search-ms', '.theme', '.themepack', '.rdp', '.ws', '.mof', '.ocx', '.hlp',
])

export function isRiskyToOpen(path: string): boolean {
  // A trailing dot/space is ignored by Windows ("evil.exe." opens as evil.exe).
  const cleaned = path.replace(/[. ]+$/, '')
  // Alternate data stream suffix ("file.txt:evil.exe") must not hide the type.
  const withoutStream = cleaned.replace(/:[^\\/:]*$/, '')
  const ext = extname(withoutStream).toLowerCase()
  if (ext === '') return true // extensionless files: unknown handler, ask
  return RISKY_EXTENSIONS.has(ext) || RISKY_EXTENSIONS.has(extname(cleaned).toLowerCase())
}
