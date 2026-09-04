import { access, cp, mkdir, rename, rm } from 'node:fs/promises'
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
  const parentDir = dirname(targetDir)
  // Named after targetDir itself (not a random temp name) so any leftover
  // is easy to spot and matches which restore it came from.
  const newDir = `${targetDir}.ark-manager-restoring`
  const previousDir = `${targetDir}.ark-manager-previous`

  // previousDir only ever exists here as a leftover from a PRIOR restore
  // whose own recovery attempt also failed (see the nested catch below) -
  // the happy path always removes it at the very end, and a swap failure
  // that recovers successfully removes it too (rename back, then this
  // function returns via the outer catch's rethrow, never having created a
  // second one). Silently deleting it and proceeding would risk destroying
  // the user's only surviving save, since this exact leftover state is the
  // one place this function's own data might still be. Refusing outright
  // is worse UX than self-healing, but it's the only choice that can't
  // silently lose a save - this state should be extremely rare (something
  // else fighting over the save folder at exactly the wrong instant, e.g.
  // an autosave, cloud sync, or AV scanner).
  if (await pathExists(previousDir)) {
    throw new Error(
      `A previous restore did not finish cleanly - your original save may still be at ` +
        `${previousDir}. Move it back to ${targetDir} yourself (or delete it, if ${targetDir} ` +
        'already looks correct) before restoring again.'
    )
  }

  // Build the new save content as a SIBLING of targetDir (same parent
  // directory, so the swap below is a same-volume rename) directly from the
  // snapshot - if this cp fails (bad/missing timestamp, disk full),
  // targetDir is completely untouched.
  await rm(newDir, { recursive: true, force: true })
  await mkdir(parentDir, { recursive: true })
  await cp(snapshotDir, newDir, { recursive: true })

  // The actual swap. targetDir might not exist yet (a first restore into a
  // location nothing has ever written to) - rename only when there's
  // something there to preserve. Renaming (not delete-then-recopy) means
  // there is no window where targetDir exists but is empty or partial.
  const hadExistingTarget = await pathExists(targetDir)
  if (hadExistingTarget) await rename(targetDir, previousDir)
  try {
    await rename(newDir, targetDir)
  } catch (swapError) {
    // The final rename is the one step that can still fail (e.g. something
    // else has targetDir open, or recreated it out from under this call).
    // Put the original back before propagating, so a failure here doesn't
    // leave the user with neither the old save nor the new one.
    if (hadExistingTarget) {
      try {
        await rename(previousDir, targetDir)
      } catch (recoveryError) {
        // Recovery itself failed too - the exact leftover state the guard
        // at the top of this function exists to protect. The user's
        // original save is stranded at previousDir, not silently gone;
        // say so explicitly. `cause` is this catch's own recoveryError
        // (the most immediate failure) - the original swapError's message
        // is folded into the text instead, so neither is lost.
        throw new Error(
          `Save restore failed, and restoring your original save afterward also failed - ` +
            `it should still be intact at ${previousDir}. Move it back to ${targetDir} ` +
            `manually. (swap error: ${(swapError as Error).message}; recovery error: ` +
            `${(recoveryError as Error).message})`,
          { cause: recoveryError }
        )
      }
    }
    // Recovery succeeded (or there was nothing to recover) - newDir is now
    // dead weight (a full duplicate of the chosen snapshot, trivially
    // reproducible by restoring again), clean it up before propagating the
    // real failure.
    await rm(newDir, { recursive: true, force: true })
    throw swapError
  }
  if (hadExistingTarget) await rm(previousDir, { recursive: true, force: true })
}
