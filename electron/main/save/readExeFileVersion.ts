import { execFile } from 'node:child_process'

function preparePowerShellExec(
  command: string
): [string, string[], { shell: boolean; timeout: number }] {
  const executable = `set "PSModulePath=" & chcp 65001 >NUL & powershell.exe`
  const args = ['-NoProfile', '-NonInteractive', '-InputFormat', 'None', '-Command', command]
  return [executable, args, { shell: true, timeout: 10_000 }]
}

export function readExeFileVersion(exePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const escaped = exePath.replace(/'/g, "''")
    const [executable, args, options] = preparePowerShellExec(
      `"(Get-Item -LiteralPath '${escaped}').VersionInfo.FileVersion"`
    )
    execFile(executable, args, options, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      const trimmed = stdout.trim()
      resolve(trimmed.length > 0 ? trimmed : null)
    })
  })
}
