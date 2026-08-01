import { cp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

// A restore makes targetDir an exact copy of the chosen snapshot, including
// removing any file present in targetDir but absent from the snapshot -
// that matches what the diff view (diffSaveFolders) shows the user before
// they confirm ("restoring removes X, adds back Y"), so the result must
// actually match what was previewed rather than merging on top.
export async function restoreSnapshot(
  backupRootDir: string,
  timestamp: string,
  targetDir: string
): Promise<void> {
  const snapshotDir = join(backupRootDir, timestamp)
  await rm(targetDir, { recursive: true, force: true })
  await mkdir(targetDir, { recursive: true })
  await cp(snapshotDir, targetDir, { recursive: true })
}
