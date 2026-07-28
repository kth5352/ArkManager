import { cp, mkdir } from 'node:fs/promises'

// 게임 파일과 완전히 분리된 백업 디렉터리(caller가 넘기는 backupDir, 보통
// userData/saves/{code}/)로 세이브 폴더를 통째로 복사한다. 매번 전체
// 덮어쓰기 - 증분 동기화는 하지 않는다(세이브 파일은 보통 크지 않음).
export async function backupSave(sourceDir: string, backupDir: string): Promise<void> {
  await mkdir(backupDir, { recursive: true })
  await cp(sourceDir, backupDir, { recursive: true, force: true })
}
