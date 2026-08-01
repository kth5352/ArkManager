import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

export type SaveDiffStatus = 'added' | 'removed' | 'modified'

export interface SaveDiffEntry {
  relativePath: string
  status: SaveDiffStatus
}

interface FileStat {
  size: number
  mtimeMs: number
}

async function collectFileStats(dir: string): Promise<Map<string, FileStat>> {
  const result = new Map<string, FileStat>()

  async function walk(current: string): Promise<void> {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
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
// empty (used when there is no prior snapshot yet to compare against).
// mtimeMs is compared with a 1s tolerance since some filesystems (e.g.
// FAT32) only have ~2s timestamp granularity, and fs.cp does not always
// preserve mtimes to sub-second precision across drives.
export async function diffSaveFolders(
  leftDir: string | null,
  rightDir: string
): Promise<SaveDiffEntry[]> {
  const [left, right] = await Promise.all([
    leftDir === null ? new Map<string, FileStat>() : collectFileStats(leftDir),
    collectFileStats(rightDir),
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
