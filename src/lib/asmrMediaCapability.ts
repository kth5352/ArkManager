import type { GameCode } from '../../shared/types/scanner'

// 새로 발견되는 코드가 있으면 이 배열에 한 줄만 추가하면 된다 - 다른 곳에서
// 이 화이트리스트를 참조하는 로직이 없도록 단일 지점으로 유지한다.
export const MEDIA_PLAYABLE_WORK_TYPES = ['SOU', 'MOV', 'MUS'] as const

export function isAsmrPlayableFolder(
  entry: { kind: 'file' | 'folder' },
  code: GameCode | null,
  workType: string | null
): boolean {
  if (entry.kind !== 'folder' || code === null || workType === null) return false
  return (MEDIA_PLAYABLE_WORK_TYPES as readonly string[]).includes(workType)
}
