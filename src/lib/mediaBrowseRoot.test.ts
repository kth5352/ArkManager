import { describe, expect, it } from 'vitest'
import { isSameOrInsideFolder, planAsmrFolderBrowse } from './mediaBrowseRoot'

describe('isSameOrInsideFolder', () => {
  it('matches the folder itself and descendants regardless of case/separator/trailing slash', () => {
    expect(isSameOrInsideFolder('D:\\Media', 'd:/media/')).toBe(true)
    expect(isSameOrInsideFolder('D:\\Media\\ASMR\\RJ01234567', 'D:\\Media\\')).toBe(true)
  })

  it('does not match a sibling sharing the prefix', () => {
    expect(isSameOrInsideFolder('D:\\Media2\\x', 'D:\\Media')).toBe(false)
  })
})

// ASMR/voice folder playback used to overwrite the user's saved media
// folder with whatever folder they played - their own choice was lost.
describe('planAsmrFolderBrowse', () => {
  it('browses inside the saved media folder when the work lives there', () => {
    expect(planAsmrFolderBrowse('D:\\Media\\RJ01234567', 'D:\\Media')).toEqual({
      temporaryRoot: null,
      root: 'D:\\Media',
      browseTo: 'D:\\Media\\RJ01234567',
    })
  })

  it('uses a session-only temporary root for a work outside the saved folder', () => {
    expect(planAsmrFolderBrowse('E:\\Games\\RJ01234567', 'D:\\Media')).toEqual({
      temporaryRoot: 'E:\\Games\\RJ01234567',
      root: 'E:\\Games\\RJ01234567',
      browseTo: 'E:\\Games\\RJ01234567',
    })
  })

  it('uses a temporary root when no media folder was ever saved', () => {
    expect(planAsmrFolderBrowse('E:\\Games\\RJ01234567', null).temporaryRoot).toBe(
      'E:\\Games\\RJ01234567'
    )
  })
})
