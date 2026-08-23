import { describe, it, expect } from 'vitest'
import { isAsmrPlayableFolder, MEDIA_PLAYABLE_WORK_TYPES } from './asmrMediaCapability'
import type { GameCode } from '../../shared/types/scanner'

const rjCode: GameCode = { type: 'RJ', value: 'RJ01637632' }

describe('MEDIA_PLAYABLE_WORK_TYPES', () => {
  it('includes SOU, MOV, and MUS', () => {
    expect(MEDIA_PLAYABLE_WORK_TYPES).toEqual(['SOU', 'MOV', 'MUS'])
  })
})

describe('isAsmrPlayableFolder', () => {
  it('is true for a folder with a code and a whitelisted work type', () => {
    expect(isAsmrPlayableFolder({ kind: 'folder' }, rjCode, 'SOU')).toBe(true)
    expect(isAsmrPlayableFolder({ kind: 'folder' }, rjCode, 'MOV')).toBe(true)
    expect(isAsmrPlayableFolder({ kind: 'folder' }, rjCode, 'MUS')).toBe(true)
  })

  it('is false for a game work type (RPG, SLN)', () => {
    expect(isAsmrPlayableFolder({ kind: 'folder' }, rjCode, 'RPG')).toBe(false)
    expect(isAsmrPlayableFolder({ kind: 'folder' }, rjCode, 'SLN')).toBe(false)
  })

  it('is false for a file, even with a whitelisted work type (must be an extracted folder)', () => {
    expect(isAsmrPlayableFolder({ kind: 'file' }, rjCode, 'SOU')).toBe(false)
  })

  it('is false when there is no code', () => {
    expect(isAsmrPlayableFolder({ kind: 'folder' }, null, 'SOU')).toBe(false)
  })

  it('is false when work type is unknown/uncrawled (null) - default to 실행', () => {
    expect(isAsmrPlayableFolder({ kind: 'folder' }, rjCode, null)).toBe(false)
  })
})
