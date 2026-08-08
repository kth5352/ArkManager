import { describe, expect, it } from 'vitest'
import { dialogInstanceKey } from './dialogInstanceKey'

describe('dialogInstanceKey', () => {
  it('makes closed sibling keys unique by dialog kind', () => {
    expect(
      new Set([
        dialogInstanceKey('launch'),
        dialogInstanceKey('rename'),
        dialogInstanceKey('delete'),
        dialogInstanceKey('move'),
      ]).size
    ).toBe(4)
  })

  it('keeps the active identity stable and namespaced', () => {
    expect(dialogInstanceKey('rating', 'VNV17')).toBe('rating:VNV17')
    expect(dialogInstanceKey('launch', 'VNV17')).toBe('launch:VNV17')
  })
})
