import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface SnapshotInfo {
  timestamp: string
  fileCount: number
  totalSizeBytes: number
}

async function collectFileSizes(
  dir: string
): Promise<{ fileCount: number; totalSizeBytes: number }> {
  let fileCount = 0
  let totalSizeBytes = 0

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        fileCount += 1
        totalSizeBytes += (await stat(full)).size
      }
    }
  }

  await walk(dir)
  return { fileCount, totalSizeBytes }
}

// backupRootDir not existing yet (no snapshot ever taken for this game) is
// not an error - it just means there's nothing to list.
export async function listSnapshots(backupRootDir: string): Promise<SnapshotInfo[]> {
  let entries
  try {
    entries = await readdir(backupRootDir, { withFileTypes: true })
  } catch {
    return []
  }

  const snapshots = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const { fileCount, totalSizeBytes } = await collectFileSizes(
          join(backupRootDir, entry.name)
        )
        return { timestamp: entry.name, fileCount, totalSizeBytes }
      })
  )

  return snapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
