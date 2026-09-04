import { access, cp, mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

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

    // Build the new save content as a SIBLING of targetDir (same parent
    // directory, so same volume) before touching targetDir at all - this is
    // still a real copy (stagingDir lives on the OS temp volume, which may
    // differ from targetDir's), but once it's done, swapping it into place
    // is a rename, not a delete-then-recopy: a single near-instant
    // filesystem operation with no window where targetDir exists but is
    // empty or partially written. Named after targetDir itself (not a
    // random temp name) so a leftover from a previous crash is easy to spot
    // and matches - if `mkdir`/`cp` below itself fails, targetDir is still
    // completely untouched at this point.
    const parentDir = dirname(targetDir)
    const newDir = `${targetDir}.ark-manager-restoring`
    const previousDir = `${targetDir}.ark-manager-previous`
    await rm(newDir, { recursive: true, force: true })
    await rm(previousDir, { recursive: true, force: true })
    await mkdir(parentDir, { recursive: true })
    await cp(stagingDir, newDir, { recursive: true })

    // The actual swap. targetDir might not exist yet (a first restore into
    // a location nothing has ever written to) - rename only when there's
    // something there to preserve.
    const hadExistingTarget = await pathExists(targetDir)
    if (hadExistingTarget) await rename(targetDir, previousDir)
    try {
      await rename(newDir, targetDir)
    } catch (error) {
      // The final rename is the one step that could still fail (e.g. a
      // concurrent process has targetDir open) - put the original back
      // before propagating, so a failure here never leaves the user with
      // neither the old save nor the new one.
      if (hadExistingTarget) await rename(previousDir, targetDir)
      throw error
    }
    if (hadExistingTarget) await rm(previousDir, { recursive: true, force: true })
  } finally {
    // Always runs, success or failure - the earlier version only cleaned
    // this up on the happy path and on a staging-copy failure, leaking a
    // full copy of the save in the OS temp directory on any later failure
    // (e.g. the final rename above).
    await rm(stagingDir, { recursive: true, force: true })
  }
}
