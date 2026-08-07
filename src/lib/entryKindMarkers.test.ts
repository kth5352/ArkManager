import { describe, expect, it } from 'vitest'
import {
  getDuplicateGroupForEntry,
  getExtractedArchiveCodes,
  groupDuplicatesByCode,
  isArchiveExtracted,
} from './groupDuplicatesByCode'

const code = { type: 'RJ' as const, value: 'RJ01111111' }

function entry(name: string, kind: 'file' | 'folder') {
  return {
    name,
    kind,
    code,
  }
}

describe('duplicate entry kind helpers', () => {
  it('looks up duplicates by the current entry kind', () => {
    const archive = entry('Game.zip', 'file')
    const archiveV2 = entry('Game-v2.zip', 'file')
    const folder = entry('Game', 'folder')
    const groups = groupDuplicatesByCode([archive, archiveV2, folder])

    expect(getDuplicateGroupForEntry(archive, groups)).toEqual([archive, archiveV2])
    expect(getDuplicateGroupForEntry(folder, groups)).toBeUndefined()
  })

  it('marks archives as extracted when a folder with the same code exists', () => {
    const archive = entry('Game.zip', 'file')
    const folder = entry('Game', 'folder')
    const extractedCodes = getExtractedArchiveCodes([archive, folder])

    expect(isArchiveExtracted(archive, extractedCodes)).toBe(true)
    expect(isArchiveExtracted(folder, extractedCodes)).toBe(false)
  })
})
