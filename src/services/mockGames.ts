export interface MockGame {
  id: string
  rjCode: string
  title: string
  circle: string
  releaseDate: string
}

export function generateMockGames(count: number): MockGame[] {
  return Array.from({ length: count }, (_, i) => {
    const rjCode = `RJ${100000 + i}`
    return {
      id: rjCode,
      rjCode,
      title: `샘플 타이틀 ${i + 1}`,
      circle: `서클 ${(i % 12) + 1}`,
      releaseDate: '2026-01-01',
    }
  })
}
