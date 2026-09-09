import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

export type SaveDiffStatus = 'added' | 'removed' | 'modified'

export interface SaveDiffEntry {
  relativePath: string
  status: SaveDiffStatus
}

export interface DiffSaveFoldersOptions {
  // Whether leftDir being a non-existent path (ENOENT) at its OWN root is
  // treated as an empty folder rather than an error. Defaults to true -
  // this is the pre-existing helper contract: leftDir represents "the prior
  // snapshot to compare against", and having none yet (a first-ever save,
  // or explicitly passing leftDir: null) is a normal state, not a failure.
  allowMissingLeftRoot?: boolean
  // Same, for rightDir's own root. Defaults to false - unlike the left
  // side, a missing right side was never intentionally supported; treating
  // it as empty previously happened only as a side effect of a bug (every
  // readdir failure anywhere was silently swallowed). The one legitimate
  // case - previewing a restore into a live save folder that doesn't exist
  // yet - opts in explicitly via this flag (see saveHandlers.ts's SAVE_DIFF
  // handler, which sets it only for mode: 'restore').
  allowMissingRightRoot?: boolean
}

interface FileStat {
  size: number
  mtimeMs: number
}

async function collectFileStats(dir: string, allowMissingRoot: boolean): Promise<Map<string, FileStat>> {
  const result = new Map<string, FileStat>()

  async function walk(current: string): Promise<void> {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch (error) {
      // Only the walk's OWN starting root may be missing and still count as
      // "empty" (and only when the caller allows it) - a readdir failure on
      // a NESTED subdirectory (or an EACCES/EPERM at any level) means real
      // data disappeared or became unreadable mid-scan, which must surface
      // as a genuine comparison failure rather than being silently folded
      // into "this folder is empty".
      const code = (error as NodeJS.ErrnoException).code
      if (current === dir && allowMissingRoot && code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        // Not caught here either - a stat() failure (e.g. the file vanishes
        // between readdir and stat) propagates as a full comparison
        // failure, the same as a readdir failure would.
        const info = await stat(full)
        result.set(relative(dir, full).split('\\').join('/'), {
          size: info.size,
          mtimeMs: info.mtimeMs,
        })
      }
    }
  }

  await walk(dir)
  return result
}

// Compares two save folders by relative file path + size/mtime, not file
// content - save files are almost always binary, so a byte-level content
// diff wouldn't be meaningful to show a user anyway (see the design
// decision behind this feature). `leftDir: null` treats the left side as
// empty (used when there is no prior snapshot yet to compare against) -
// this is unconditional (not gated by allowMissingLeftRoot, which only
// governs a non-null leftDir path that doesn't exist ON DISK).
// mtimeMs is compared with a 1s tolerance since some filesystems (e.g.
// FAT32) only have ~2s timestamp granularity, and fs.cp does not always
// preserve mtimes to sub-second precision across drives.
export async function diffSaveFolders(
  leftDir: string | null,
  rightDir: string,
  options?: DiffSaveFoldersOptions
): Promise<SaveDiffEntry[]> {
  const { allowMissingLeftRoot = true, allowMissingRightRoot = false } = options ?? {}
  const [left, right] = await Promise.all([
    leftDir === null ? new Map<string, FileStat>() : collectFileStats(leftDir, allowMissingLeftRoot),
    collectFileStats(rightDir, allowMissingRightRoot),
  ])

  const entries: SaveDiffEntry[] = []
  const allPaths = new Set([...left.keys(), ...right.keys()])
  for (const path of allPaths) {
    const l = left.get(path)
    const r = right.get(path)
    if (l && !r) {
      entries.push({ relativePath: path, status: 'removed' })
    } else if (!l && r) {
      entries.push({ relativePath: path, status: 'added' })
    } else if (l && r && (l.size !== r.size || Math.abs(l.mtimeMs - r.mtimeMs) > 1000)) {
      entries.push({ relativePath: path, status: 'modified' })
    }
  }
  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}
