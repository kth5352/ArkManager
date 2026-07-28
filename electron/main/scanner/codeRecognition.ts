import type { GameCode, GameCodeType } from '../../../shared/types/scanner'

const CODE_PATTERN = /\b(RJ|VJ|ST)(\d+)\b/i

export function extractCode(name: string): GameCode | null {
  const match = CODE_PATTERN.exec(name)
  if (!match) return null
  const type = match[1].toUpperCase() as GameCodeType
  const digits = match[2]
  return { type, value: `${type}${digits}` }
}
