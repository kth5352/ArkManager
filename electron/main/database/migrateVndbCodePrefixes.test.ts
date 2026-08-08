import { describe, expect, it } from 'vitest'
import { legacyVndbCodeToCanonical } from './migrateVndbCodePrefixes'

describe('legacyVndbCodeToCanonical', () => {
  it('converts only exact legacy VNDB codes', () => {
    expect(legacyVndbCodeToCanonical('VN17')).toBe('VNV17')
    expect(legacyVndbCodeToCanonical('VR45775')).toBe('VNR45775')
    expect(legacyVndbCodeToCanonical('VNV17')).toBeNull()
    expect(legacyVndbCodeToCanonical('VN1junk')).toBeNull()
  })
})
