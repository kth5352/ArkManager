import { access, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const LE_PROC_FILENAME = 'LEProc.exe'
// A real install doesn't always sit directly under a "Locale Emulator"
// folder - it's commonly bundled a few levels deep inside another app's own
// folder structure (e.g. Program Files\DLsiteNest\Assets\LocalEmulator\
// LEProc.exe). This walks a bounded number of levels under each candidate
// base instead of assuming a fixed subfolder name/depth.
const SEARCH_DEPTH = 4

// Searches baseDir and up to `depth` levels of its subfolders for
// LEProc.exe, stopping at the first match. Bounded by `depth` (not by
// symlink/junction detection) - a directory cycle still terminates within
// the depth budget since it strictly decreases each level, same as
// scanLibraryRecursive's own reasoning for images/archives.
export async function findLocaleEmulatorAt(
  baseDir: string,
  depth = SEARCH_DEPTH
): Promise<string | null> {
  let entries
  try {
    entries = await readdir(baseDir, { withFileTypes: true })
  } catch {
    return null
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name === LE_PROC_FILENAME) {
      return join(baseDir, entry.name)
    }
  }

  if (depth <= 0) return null

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const found = await findLocaleEmulatorAt(join(baseDir, entry.name), depth - 1)
    if (found) return found
  }

  return null
}

// 알려진 설치 경로만 확인한다 - 레지스트리 키는 공식 문서로 확인하지
// 못해 사용하지 않는다. LOCALAPPDATA\Programs는 관리자 권한 없이 설치한
// 사용자별 설치를 위한 경로. 그 외의 임의 경로에 설치한 경우는
// overridePath(설정에 저장된 수동 지정 경로)로만 찾을 수 있다.
export async function detectLocaleEmulator(overridePath?: string | null): Promise<string | null> {
  if (overridePath) {
    try {
      await access(overridePath)
      return overridePath
    } catch {
      // 저장된 경로가 더 이상 유효하지 않음 (파일 이동/삭제) - 자동 감지로 폴백
    }
  }

  const candidateBases = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env['LOCALAPPDATA'] ? join(process.env['LOCALAPPDATA'], 'Programs') : undefined,
  ].filter((base): base is string => Boolean(base))
  for (const base of candidateBases) {
    const found = await findLocaleEmulatorAt(base)
    if (found) return found
  }
  return null
}
