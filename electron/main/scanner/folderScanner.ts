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
): Pick<ScannedEntry, 'code' | 'codeSource'> {
  const fromName = extractCode(name)
  if (fromName) return { code: fromName, codeSource: 'filename' }
  const overrideCode = overrides.get(normalizeLibraryPath(path))
  if (!overrideCode) return { code: null, codeSource: undefined }
  const type = overrideCode.slice(0, 2) as GameCodeType
  return { code: { type, value: overrideCode }, codeSource: 'override' }
}

// An entry can become unstattable between readdir() and stat() - a
// permission error, a broken link, or the entry being deleted mid-scan.
// Returns null in that case rather than throwing, so one bad entry doesn't
// fail the whole listing (see scanFolderShallow / scanLibraryRecursive).
async function toScannedEntry(
  parentPath: string,
  name: string,
  overrides: Map<string, string>,
  onProgress?: () => void
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
      ...resolveCode(name, path, overrides),
    }
  } catch {
    return null
  } finally {
    onProgress?.()
  }
}

function isScannedEntry(entry: ScannedEntry | null): entry is ScannedEntry {
  return entry !== null
}

// Cover art / CG images are excluded from game recognition entirely (never
// their own ScannedEntry, never counted toward a folder's code signal) -
// unlike audio/video they carry no reliable naming convention (a game's CG
// images may or may not embed its code) and were never meant to be
// individually browsable game-like items in the first place. Explorer's
// plain folder browsing (scanFolderShallow) still shows them, matching a
// real file explorer - this only affects scanLibraryRecursive and the
// classification below.
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'])

function isImageFile(name: string): boolean {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex === -1) return false
  return IMAGE_EXTENSIONS.has(name.slice(dotIndex).toLowerCase())
}

// Like scanFolderShallow, but for scanLibraryRecursive's internal use only:
// images are filtered out of `names` before stat() is ever called on them
// (never worth the syscall - see isImageFile), and the result doubles as
// both a folder's classification signal (classifyChildren below) and the
// starting point for recursing into it, so each folder in the tree is only
// read once no matter how deep the recursion goes.
async function scanNonImageChildren(
  dirPath: string,
  overrides: Map<string, string>,
  onProgress?: () => void
): Promise<ScannedEntry[]> {
  const names = await readdir(dirPath)
  const entries = await Promise.all(
    names
      .filter((name) => !isImageFile(name))
      .map((name) => toScannedEntry(dirPath, name, overrides, onProgress))
  )
  return entries.filter(isScannedEntry)
}

// Distinguishes a code-less folder that's a real wrapper holding at least
// one individually-identifiable game (a code that appears on exactly one
// child - e.g. a single loose "RJ01234567.zip" archive sitting beside an
// unrelated readme.txt - still needs to be walked so that child surfaces
// on its own) from one that's most likely itself an unrecognized game's
// own root. A code that appears on 2+ children (e.g. dozens of voice
// files all named with the same RJ code, a common DLsite convention for
// an unpacked game's own assets) is a naming-convention signal, not
// several separate games - every child carrying that code is really just
// one asset of the single game the folder itself represents. Combined
// with hasDirectFile (most engines - Unity, RPG Maker, NScripter/
// TyranoScript-style VNs alike - drop a launcher/config/data file directly
// in the game's own top folder, alongside any engine-specific subfolders),
// a folder with at least one direct file and no singleton-coded child
// collapses into a single leaf instead of exposing its contents
// individually. A folder with zero direct files but only subfolders is
// still walked either way - that's the shape of a circle/category folder
// holding further category or game folders.
function classifyChildren(children: ScannedEntry[]): {
  hasSingletonCodedChild: boolean
  hasDirectFile: boolean
} {
  const codeCounts = new Map<string, number>()
  for (const child of children) {
    if (!child.code) continue
    codeCounts.set(child.code.value, (codeCounts.get(child.code.value) ?? 0) + 1)
  }
  return {
    hasSingletonCodedChild: [...codeCounts.values()].some((count) => count === 1),
    hasDirectFile: children.some((c) => c.kind === 'file'),
  }
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
  const entries = await Promise.all(names.map((name) => toScannedEntry(dirPath, name, overrides)))
  return entries.filter(isScannedEntry)
}

// Shared by scanLibraryRecursive's entry point and its own recursive step -
// `children` is always a folder's freshly-read (and already stat()ed)
// direct children, computed exactly once by the caller via
// scanNonImageChildren, never re-read here.
async function scanChildren(
  children: ScannedEntry[],
  overrides: Map<string, string>,
  onProgress?: () => void
): Promise<ScannedEntry[]> {
  const results: ScannedEntry[] = []

  for (const entry of children) {
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

    let nestedChildren: ScannedEntry[]
    try {
      nestedChildren = await scanNonImageChildren(entry.path, overrides, onProgress)
    } catch {
      // Subfolder became unreadable mid-scan (permission error, race, or
      // a race with deletion) - skip this branch only, sibling branches
      // still scan normally.
      continue
    }

    const { hasSingletonCodedChild, hasDirectFile } = classifyChildren(nestedChildren)
    if (hasDirectFile && !hasSingletonCodedChild) {
      results.push(entry)
      continue
    }

    const nested = await scanChildren(nestedChildren, overrides, onProgress)
    results.push(...nested)
  }

  return results
}

// Gallery/List: recursively walks the entire library tree. Coded entries
// (file or folder) are leaves - matched, not walked further. Code-less
// files are included too (code: null) rather than dropped, per the
// 코드없는 파일 노출 decision - but only when found directly inside a folder
// that turns out to be a genuine multi-game container (see
// classifyChildren). A code-less folder with at least one direct file and
// no singleton-coded child is itself treated as a leaf instead of being
// walked - so a game's own internal files (save data, repeated same-code
// audio assets, engine files) never get exposed as individual entries just
// because the game folder wasn't given a recognizable code. A pure
// code-less subfolder hierarchy (no direct files at all) is still walked,
// since that's a circle/category folder rather than a game's own root.
// Images are skipped entirely - see isImageFile.
export async function scanLibraryRecursive(
  libraryPath: string,
  overrides: Map<string, string> = new Map(),
  onProgress?: () => void
): Promise<ScannedEntry[]> {
  const children = await scanNonImageChildren(libraryPath, overrides, onProgress)
  return scanChildren(children, overrides, onProgress)
}
