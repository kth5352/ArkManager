import { normalizeLibraryPath } from '../database/librariesRepository'

export interface GameEntryIdentifier {
  code: { value: string } | null
  path: string
}

export function resolveGameEntryKey(identifier: GameEntryIdentifier): {
  key: string
  keyType: 'code' | 'path'
} {
  if (identifier.code) return { key: identifier.code.value, keyType: 'code' }
  return { key: normalizeLibraryPath(identifier.path), keyType: 'path' }
}
