import { lstat, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { GameCodeType, ScannedEntry } from '../../../shared/types/scanner'
import { normalizeLibraryPath } from '../database/librariesRepository'
import { extractCode } from './codeRecognition'

// Prefers the filename-derived code; falls back to a manually-linked
// path_code_overrides entry (the "코드 연동" feature) for code-less
// files/folders whose name doesn't contain a recognizable code. This is what
// lets a code-less FOLDER be resolved as a coded leaf during a recursive
// scan instead of always being walked into (see scanLibraryRecursive).
function resolveCode(
  name: string,
  path: string,
  overrides: Map<string, string>
): ScannedEntry['code'] {
  const fromName = extractCode(name)
  if (fromName) return fromName
  const overrideCode = overrides.get(normalizeLibraryPath(path))
  if (!overrideCode) return null
  const type = overrideCode.slice(0, 2) as GameCodeType
  return { type, value: overrideCode }
}

// An entry can become unstattable between readdir() and stat() - a
// permission error, a broken link, or the entry being deleted mid-scan.
// Returns null in that case rather than throwing, so one bad entry doesn't
// fail the whole listing (see scanFolderShallow / scanLibraryRecursive).
async function toScannedEntry(
  parentPath: string,
  name: string,
  overrides: Map<string, string>
): Promise<ScannedEntry | null> {
  const path = join(parentPath, name)
  try {
    const stats = await stat(path)
    return {
      name,
      path,
      kind: stats.isDirectory() ? 'folder' : 'file',
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      code: resolveCode(name, path, overrides),
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
export async function scanFolderShallow(
  dirPath: string,
  overrides: Map<string, string> = new Map()
): Promise<ScannedEntry[]> {
  const names = await readdir(dirPath)
  const entries = await Promise.all(
    names.map((name) => toScannedEntry(dirPath, name, overrides))
  )
  return entries.filter(isScannedEntry)
}

// Gallery/List: recursively walks the entire library tree. Coded entries
// (file or folder) are leaves - matched, not walked further. Code-less
// files are now included too (code: null) rather than dropped, per the
// 코드없는 파일 노출 decision. Code-less folders are still walked into,
// looking for coded/uncoded descendants at any depth.
export async function scanLibraryRecursive(
  libraryPath: string,
  overrides: Map<string, string> = new Map()
): Promise<ScannedEntry[]> {
  const names = await readdir(libraryPath)
  const results: ScannedEntry[] = []

  for (const name of names) {
    const entry = await toScannedEntry(libraryPath, name, overrides)
    if (!entry) continue

    if (entry.code) {
      results.push(entry)
      continue
    }

    if (entry.kind === 'file') {
      results.push(entry)
      continue
    }

    // Skip recursing into symlinks/junctions - a link pointing back at an
    // ancestor directory would otherwise cause infinite recursion. Treated
    // as a leaf that just isn't walked, like a coded folder above.
    if (await isSymbolicLink(entry.path)) continue

    try {
      const nested = await scanLibraryRecursive(entry.path, overrides)
      results.push(...nested)
    } catch {
      // Subfolder became unreadable mid-scan (permission error, race, or
      // a race with deletion) - skip this branch only, sibling branches
      // still scan normally.
      continue
    }
  }

  return results
}
