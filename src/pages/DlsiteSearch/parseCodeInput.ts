import type { GameCode, GameCodeType } from '../../../shared/types/scanner'

const CODE_PATTERN = /^(RJ|VJ|ST|VN)(\d+)$/i

// 입력이 RJ/VJ/ST 코드 형식이면 GameCode로, 아니면 null(자유 텍스트 제목
// 검색으로 취급)을 반환한다. electron/main/scanner/codeRecognition.ts의
// extractCode와 의도는 같지만 그쪽은 파일명 "안에서" 코드를 찾고 이쪽은
// 입력 "전체가" 코드인지 판별하므로 앵커(^...$)가 다르다 - 별도 구현.
export function parseCodeInput(input: string): GameCode | null {
  const trimmed = input.trim()
  const match = CODE_PATTERN.exec(trimmed)
  if (!match) return null
  const type = match[1].toUpperCase() as GameCodeType
  return { type, value: `${type}${match[2]}` }
}
