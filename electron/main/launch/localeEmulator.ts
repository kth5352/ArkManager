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
// 못해 사용하지 않는다. 두 경로 모두 없으면 미설치로 간주한다.
export async function detectLocaleEmulator(): Promise<string | null> {
  const candidateBases = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']].filter(
    (base): base is string => Boolean(base)
  )
  for (const base of candidateBases) {
    const found = await findLocaleEmulatorAt(base)
    if (found) return found
  }
  return null
}
