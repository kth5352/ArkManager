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
export async function detectGameVersion(
  gameFolderPath: string,
  preferredExePath: string | null,
  readExeVersion: (exePath: string) => Promise<string | null> = defaultReadExeFileVersion
): Promise<string | null> {
  if (preferredExePath) {
    const version = await readExeVersion(preferredExePath)
    if (version) return version
  }

  const executables = await listExecutables(gameFolderPath)
  for (const exePath of executables) {
    if (exePath === preferredExePath) continue
    const version = await readExeVersion(exePath)
    if (version) return version
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
