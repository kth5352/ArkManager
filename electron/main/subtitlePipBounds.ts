export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

function rectsOverlap(a: WindowBounds, b: WindowBounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

// 저장된 PIP 창 위치가 지금 연결된 모니터들의 작업 영역 중 어느 하나와도
// 겹치지 않으면(모니터 연결 해제, 해상도 변경 등으로 화면 밖에 남겨진 경우)
// 기본 위치로 되돌린다. 완전히 다 보일 필요는 없다 - 일부라도 겹치면 사용자가
// 드래그해서 다시 끌어올 수 있으므로 그대로 둔다.
export function clampSubtitlePipBounds(
  saved: WindowBounds | null,
  displayWorkAreas: WindowBounds[],
  defaultBounds: WindowBounds
): WindowBounds {
  if (!saved) return defaultBounds
  const fitsAnyDisplay = displayWorkAreas.some((display) => rectsOverlap(saved, display))
  return fitsAnyDisplay ? saved : defaultBounds
}
