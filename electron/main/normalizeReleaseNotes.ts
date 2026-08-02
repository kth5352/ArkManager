import type { UpdateInfo } from 'electron-updater'
import type { ReleaseNote } from '../../shared/types/ipc'

// electron-updater reports releaseNotes as either a single string (GitHub
// release body for the target version alone) or an array of
// {version, note} covering every version between the currently-running one
// and the target - only in the array form once autoUpdater.fullChangelog is
// enabled (see updater.ts), otherwise GitHubProvider always collapses it to
// a plain string regardless of how many versions are being skipped.
// Normalized to always be an array so the renderer never has to handle both
// shapes.
//
// Pulled out of updater.ts (rather than living there directly) because
// that file sets electron-updater's autoUpdater options as a top-level
// module side effect, which lazily constructs a singleton requiring a real
// Electron `app` - importing it at all fails outside a running Electron
// process, including from a plain Vitest run. This file only imports
// electron-updater's TYPES (erased at compile time), so it stays testable
// like every other pure-logic file in this codebase.
export function normalizeReleaseNotes(info: UpdateInfo): ReleaseNote[] {
  const { releaseNotes } = info
  if (!releaseNotes) return []
  if (typeof releaseNotes === 'string') return [{ version: info.version, note: releaseNotes }]
  return releaseNotes.map((entry) => ({ version: entry.version, note: entry.note ?? '' }))
}
