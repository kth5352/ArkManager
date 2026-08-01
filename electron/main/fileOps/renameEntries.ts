import { access, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { RenameResultDto } from '../../../shared/types/ipc'

// Windows treats these as reserved device names regardless of extension -
// matched against the part before the first dot, so "CON.txt" is just as
// invalid as "CON" itself.
const RESERVED_DEVICE_NAME = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i

// Returns the actual name to use (surrounding whitespace trimmed, same as
// the validation below already treats it) or null if the name can't be
// used at all. Renaming used to validate this trimmed value but then join()
// the caller's ORIGINAL, untrimmed newName into the real path - a name with
// trailing whitespace passed validation (trim() made it look non-empty) but
// the actual rename() call still received the untrimmed string, silently
// landing on a different name on disk than what was validated/previewed.
function sanitizedFileName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed === '' || trimmed === '.' || trimmed === '..') return null
  // A path separator would move the entry into a different folder entirely
  // (or escape it via "..\") instead of just renaming it in place.
  if (trimmed.includes('/') || trimmed.includes('\\')) return null
  // Windows silently strips a trailing dot when the entry is actually
  // created, so the name that lands on disk would otherwise quietly differ
  // from what the user typed/previewed.
  if (trimmed.endsWith('.')) return null
  if (RESERVED_DEVICE_NAME.test(trimmed.split('.')[0])) return null
  return trimmed
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
    const safeName = sanitizedFileName(newName)
    if (safeName === null) {
      results.push({ path, success: false, error: '올바르지 않은 이름입니다.' })
      continue
    }

    const newPath = join(dirname(path), safeName)

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
