import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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

  // Stage the copy in a scratch directory and confirm it fully succeeds
  // BEFORE touching targetDir, which holds the user's live save. Copying
  // straight into targetDir after wiping it - the previous approach - meant
  // a missing/bad timestamp or a mid-copy failure destroyed the live save
  // with nothing actually restored in its place.
  const stagingDir = await mkdtemp(join(tmpdir(), 'ark-manager-restore-'))
  try {
    await cp(snapshotDir, stagingDir, { recursive: true })
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true })
    throw error
  }

  await rm(targetDir, { recursive: true, force: true })
  await mkdir(targetDir, { recursive: true })
  await cp(stagingDir, targetDir, { recursive: true })
  await rm(stagingDir, { recursive: true, force: true })
}
