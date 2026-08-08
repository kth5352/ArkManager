import type { GameCode, GameCodeType } from './types/scanner'

const CANONICAL_CODE_PATTERN = /^(RJ|VJ|ST|VNV|VNR|GC)(\d+)$/i

export function parseCanonicalGameCode(value: string): GameCode | null {
  const match = CANONICAL_CODE_PATTERN.exec(value)
  if (!match) return null

  const type = match[1].toUpperCase() as GameCodeType
  return { type, value: `${type}${match[2]}` }
}

export function numericGameCodeId(code: GameCode): string {
  return code.value.slice(code.type.length)
}
