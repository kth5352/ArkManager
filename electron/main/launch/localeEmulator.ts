import { access } from 'node:fs/promises'
import { join } from 'node:path'

// 특정 기준 디렉터리 아래에 LEProc.exe가 있는지 확인하는 순수 로직 -
// detectLocaleEmulator가 실제 Program Files 경로들로 이 함수를 호출한다.
// 테스트 가능하도록 기준 디렉터리를 인자로 분리했다.
export async function findLocaleEmulatorAt(baseDir: string): Promise<string | null> {
  const candidate = join(baseDir, 'Locale Emulator', 'LEProc.exe')
  try {
    await access(candidate)
    return candidate
  } catch {
    return null
  }
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
