import { access, cp, rename, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { normalizeLibraryPath } from '../../../shared/normalizeLibraryPath'
import type { MoveResultDto } from '../../../shared/types/ipc'

async function pathExists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false)
}

async function moveOne(sourcePath: string, destDir: string): Promise<string> {
  const destPath = join(destDir, basename(sourcePath))

  if (normalizeLibraryPath(destPath) === normalizeLibraryPath(sourcePath)) {
    return destPath
  }
  if (await pathExists(destPath)) {
    throw new Error('대상 위치에 같은 이름의 파일/폴더가 이미 있습니다.')
  }

  try {
    await rename(sourcePath, destPath)
  } catch (error) {
    // EXDEV: source and destination are on different drives/volumes -
    // rename() can't do an atomic move across them, so fall back to a full
    // copy followed by removing the original. Anything else is a real
    // failure (permission denied, source no longer exists, etc.) and
    // shouldn't be silently swallowed by attempting a copy anyway.
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    try {
      await cp(sourcePath, destPath, { recursive: true })
    } catch (cpError) {
      // Unlike rename(), cp() across volumes is not atomic - a failure
      // partway through (disk full on the destination volume, a source file
      // that becomes unreadable mid-copy) can leave a partial, corrupt
      // destPath behind. Left in place, it would permanently block every
      // future retry of this same move (the collision check above only
      // knows destPath already exists, not that it's a botched half-copy),
      // forcing the user to go delete it manually first.
      //
      // Best-effort only: cpError is already the more informative failure
      // (e.g. "disk full"), and a secondary EPERM/EBUSY from something else
      // holding the half-copied destPath open (an AV scanner, a lingering
      // handle from the interrupted copy) must not replace it with a less
      // useful cleanup error - same reasoning as restoreSnapshot.ts's
      // equivalent best-effort cleanups.
      await rm(destPath, { recursive: true, force: true }).catch(() => {})
      throw cpError
    }
    await rm(sourcePath, { recursive: true, force: true })
  }

  return destPath
}

// Sequential (not Promise.all) - same reasoning as renameEntries: a
// collision check for one item shouldn't race a different item's move.
export async function moveEntries(paths: string[], destDir: string): Promise<MoveResultDto[]> {
  const results: MoveResultDto[] = []

  for (const path of paths) {
    try {
      const newPath = await moveOne(path, destDir)
      results.push({ path, success: true, newPath })
    } catch (error) {
      results.push({
        path,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}
