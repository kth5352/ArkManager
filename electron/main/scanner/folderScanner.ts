import { lstat, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { GameEntry, ScannedEntry } from '../../../shared/types/scanner'
import { extractCode } from './codeRecognition'

// An entry can become unstattable between readdir() and stat() - a
// permission error, a broken link, or the entry being deleted mid-scan.
// Returns null in that case rather than throwing, so one bad entry doesn't
// fail the whole listing (see scanFolderShallow / scanLibraryRecursive).
async function toScannedEntry(parentPath: string, name: string): Promise<ScannedEntry | null> {
  const path = join(parentPath, name)
  try {
    const stats = await stat(path)
    return {
      name,
      path,
      kind: stats.isDirectory() ? 'folder' : 'file',
      mtimeMs: stats.mtimeMs,
      code: extractCode(name),
    }
  } catch {
    return null
  }
}

function isScannedEntry(entry: ScannedEntry | null): entry is ScannedEntry {
  return entry !== null
}

// Directory junctions/symlinks are followed by stat() when classifying kind,
// but must not be followed when deciding whether to recurse - a junction
// pointing back at an ancestor directory would otherwise cause infinite
// recursion. lstat() (unlike stat()) does not follow the link itself.
async function isSymbolicLink(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path)
    return stats.isSymbolicLink()
  } catch {
    return false
  }
}

// Explorer: lists dirPath's direct children only, exactly like a real file
// explorer - every entry is shown regardless of whether it's a recognized
// game. Never descends into subfolders (thumbnail lookup is a separate,
// lazy step - see scanner/thumbnail.ts and the get-thumbnail IPC handler).
export async function scanFolderShallow(dirPath: string): Promise<ScannedEntry[]> {
  const names = await readdir(dirPath)
  const entries = await Promise.all(names.map((name) => toScannedEntry(dirPath, name)))
  return entries.filter(isScannedEntry)
}

// Gallery/List: recursively walks the entire library tree and returns only
// entries with a recognized RJ/VJ/ST code, flattened. A folder that is
// itself a recognized game (e.g. an unzipped "RJ01111/" containing cover.jpg
// and data.pak) is treated as a leaf - its contents are not walked or
// listed separately, since they're not games themselves. The return type
// guarantees `code` is non-null (see GameEntry) since non-matching entries
// are never included.
export async function scanLibraryRecursive(libraryPath: string): Promise<GameEntry[]> {
  const names = await readdir(libraryPath)
  const results: GameEntry[] = []

  for (const name of names) {
    const entry = await toScannedEntry(libraryPath, name)
    if (!entry) continue

    if (entry.code) {
      results.push({ ...entry, code: entry.code })
      continue
    }

    if (entry.kind === 'folder') {
      // Skip recursing into symlinks/junctions - a link pointing back at an
      // ancestor directory would otherwise cause infinite recursion. Treated
      // as a leaf that just isn't walked, like a coded folder above.
      if (await isSymbolicLink(entry.path)) continue

      try {
        const nested = await scanLibraryRecursive(entry.path)
        results.push(...nested)
      } catch {
        // Subfolder became unreadable mid-scan (permission error, race, or
        // a race with deletion) - skip this branch only, sibling branches
        // still scan normally.
        continue
      }
    }
  }

  return results
}
