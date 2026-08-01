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
    await cp(sourcePath, destPath, { recursive: true })
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
