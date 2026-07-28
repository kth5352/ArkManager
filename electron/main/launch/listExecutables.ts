import { readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'

// 최상위 1단계만 본다 - 실행파일 선택은 사용자가 직접 고르는 UI이므로 깊은
// 재귀로 노이즈를 늘릴 필요가 없다(설치파일/제거파일도 섞여 나올 수 있지만
// 최종 선택은 사용자 몫 - 스펙의 명시적 제외 사항).
export async function listExecutables(folderPath: string): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(folderPath)
  } catch {
    return []
  }
  return names.filter((name) => extname(name).toLowerCase() === '.exe').map((name) => join(folderPath, name))
}
