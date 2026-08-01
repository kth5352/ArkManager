import { access, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { RenameResultDto } from '../../../shared/types/ipc'

function isSafeFileName(name: string): boolean {
  const trimmed = name.trim()
  if (trimmed === '' || trimmed === '.' || trimmed === '..') return false
  // A path separator would move the entry into a different folder entirely
  // (or escape it via "..\") instead of just renaming it in place.
  return !trimmed.includes('/') && !trimmed.includes('\\')
}

// Windows' filesystem is case-insensitive, so a plain existence check on
// the destination would reject the common "fix the casing" rename (e.g.
// "mygame" -> "MyGame") as "already exists", even though it's really the
// same entry - rename() itself handles a case-only change correctly and
// must not be short-circuited by the collision check below.
function isCaseOnlyChange(path: string, newPath: string): boolean {
  return path.toLowerCase() === newPath.toLowerCase()
}

// Sequential (not Promise.all) - two renames targeting the same destination
// name in one batch must resolve deterministically in the order the caller
// specified them, not race each other.
export async function renameEntries(
  renames: { path: string; newName: string }[]
): Promise<RenameResultDto[]> {
  const results: RenameResultDto[] = []

  for (const { path, newName } of renames) {
    if (!isSafeFileName(newName)) {
      results.push({ path, success: false, error: '올바르지 않은 이름입니다.' })
      continue
    }

    const newPath = join(dirname(path), newName)

    if (!isCaseOnlyChange(path, newPath)) {
      const alreadyExists = await access(newPath)
        .then(() => true)
        .catch(() => false)
      if (alreadyExists) {
        results.push({ path, success: false, error: '같은 이름의 파일/폴더가 이미 있습니다.' })
        continue
      }
    }

    try {
      await rename(path, newPath)
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
