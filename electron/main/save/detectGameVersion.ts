import { readdir } from 'node:fs/promises'
import { listExecutables } from '../launch/listExecutables'
import { extractVersionFromName } from './extractVersion'
import { readExeFileVersion as defaultReadExeFileVersion } from './readExeFileVersion'

// Three-tier fallback, first non-null result wins: (1) the game's
// configured launch executable's own PE file-version resource - most
// likely to be accurate since it's the exe the user actually runs; (2) any
// other top-level exe in the folder, for games with no launch config saved
// yet; (3) a x.y.z-shaped substring in any top-level file/folder name (many
// indie games never set PE version info, but their release zip/folder name
// often carries a real version). Never throws - every tier degrades to
// "try the next one" on any error, including a folder that doesn't exist
// (a not-yet-extracted archive), so the whole chain just returns null.
//
// A PE FileVersion is frequently not a bare dotted number - Windows itself
// reports e.g. "10.0.19041.4522 (WinBuild.160101.0800)" - and compareVersions
// (by design) returns null rather than a wrong answer for a non-numeric
// segment, which would silently disable every downstream comparison for any
// exe reporting a string shaped like that. A PE version string always puts
// the dotted-number version first, with any build/description text after a
// space - unlike extractVersionFromName's x.y.z-with-digit-cap pattern
// (built to reject accidental matches inside arbitrary filenames, e.g. a
// "1920x1080"-shaped resolution string), which doesn't apply here: this is
// trusted, structured PE resource data, not filename noise, and a real
// build/revision segment can exceed 4 digits (Windows' own build number
// above is 5) - so the digit cap would wrongly reject the whole string
// rather than trim it. The leading whitespace-delimited token is always
// exactly the version, whatever its own segment count or width.
function normalizePeVersion(raw: string): string {
  return raw.split(/\s/)[0]
}

export async function detectGameVersion(
  gameFolderPath: string,
  preferredExePath: string | null,
  readExeVersion: (exePath: string) => Promise<string | null> = defaultReadExeFileVersion
): Promise<string | null> {
  if (preferredExePath) {
    const version = await readExeVersion(preferredExePath)
    if (version) return normalizePeVersion(version)
  }

  const executables = await listExecutables(gameFolderPath)
  for (const exePath of executables) {
    if (exePath === preferredExePath) continue
    const version = await readExeVersion(exePath)
    if (version) return normalizePeVersion(version)
  }

  let names: string[]
  try {
    names = await readdir(gameFolderPath)
  } catch {
    return null
  }
  for (const name of names) {
    const version = extractVersionFromName(name)
    if (version) return version
  }

  return null
}
