import { describe, it, expect } from 'vitest'
import { isEntryExcluded } from './isEntryExcluded'

describe('isEntryExcluded', () => {
  it('returns true for an entry whose normalized path is in the excluded set', () => {
    const entry = { path: 'D:\\Games\\Some-Folder\\' }
    expect(isEntryExcluded(entry, new Set(['d:\\games\\some-folder']))).toBe(true)
  })

  it('returns false for an entry whose normalized path is not excluded', () => {
    const entry = { path: 'd:\\games\\other-folder' }
    expect(isEntryExcluded(entry, new Set(['d:\\games\\some-folder']))).toBe(false)
  })

  it('returns false when the excluded set is empty', () => {
    const entry = { path: 'd:\\games\\foo' }
    expect(isEntryExcluded(entry, new Set())).toBe(false)
  })

  it('treats two entries sharing a code but at different paths independently', () => {
    // Same underlying game code, two different folders - only the one
    // actually excluded (by path) should match. isEntryExcluded no longer
    // even looks at `code` - this is the whole point of the fix.
    const copyA = { path: 'd:\\games\\copy-a' }
    const copyB = { path: 'd:\\games\\copy-b' }
    const excluded = new Set(['d:\\games\\copy-a'])
    expect(isEntryExcluded(copyA, excluded)).toBe(true)
    expect(isEntryExcluded(copyB, excluded)).toBe(false)
  })
})
