import { execFile } from 'node:child_process'
import { join } from 'node:path'

// SECURITY: exePath comes from a file/folder name inside a user's library -
// i.e. from whatever archive the user downloaded - so it is attacker
// controlled (a folder may be named e.g. "x$(calc)" or "a&b"). It must never
// be interpolated into a command line or a PowerShell script text.
//
// - No `shell: true`: execFile spawns powershell.exe directly, so cmd.exe
//   never parses anything.
// - The path travels in an environment variable and the script only ever
//   *reads* `$env:ARK_EXE_PATH` as data; PowerShell does not re-parse the
//   content of a variable, so quotes, `$()` and backticks in it are inert.
// - Absolute path to the system powershell.exe (not resolved through PATH),
//   and an empty PSModulePath so no module in a user-writable location is
//   auto-loaded.
const SCRIPT =
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' +
  "$p=$env:ARK_EXE_PATH;if(-not $p){exit 1};(Get-Item -LiteralPath $p -ErrorAction Stop).VersionInfo.FileVersion"

function systemPowerShellPath(): string {
  const root = process.env['SystemRoot'] ?? 'C:\\Windows'
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

export function readExeFileVersion(exePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof exePath !== 'string' || exePath.length === 0 || exePath.includes('\0')) {
      resolve(null)
      return
    }
    execFile(
      systemPowerShellPath(),
      ['-NoProfile', '-NonInteractive', '-InputFormat', 'None', '-Command', SCRIPT],
      {
        timeout: 10_000,
        windowsHide: true,
        maxBuffer: 64 * 1024,
        env: { ...process.env, ARK_EXE_PATH: exePath, PSModulePath: '' },
      },
      (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }
        const trimmed = stdout.trim()
        resolve(trimmed.length > 0 ? trimmed : null)
      }
    )
  })
}
