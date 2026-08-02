import { describe, it, expect } from 'vitest'
import { normalizeReleaseNotes } from './normalizeReleaseNotes'
import type { UpdateInfo } from 'electron-updater'

// Only releaseNotes varies across these tests - the rest of UpdateInfo is
// required by its own type but irrelevant to normalizeReleaseNotes itself.
function makeUpdateInfo(releaseNotes: UpdateInfo['releaseNotes']): UpdateInfo {
  return {
    version: '1.2.3',
    files: [],
    path: '',
    sha512: '',
    releaseDate: '2026-01-01T00:00:00.000Z',
    releaseNotes,
  }
}

describe('normalizeReleaseNotes', () => {
  it('wraps a plain string (fullChangelog: false shape) as a single-entry array keyed by the info version', () => {
    const info = makeUpdateInfo('Fixed a bug.')
    expect(normalizeReleaseNotes(info)).toEqual([{ version: '1.2.3', note: 'Fixed a bug.' }])
  })

  it('passes an array (fullChangelog: true shape) through, defaulting a null note to an empty string', () => {
    const info = makeUpdateInfo([
      { version: '1.2.3', note: 'Latest changes.' },
      { version: '1.2.2', note: null },
    ])
    expect(normalizeReleaseNotes(info)).toEqual([
      { version: '1.2.3', note: 'Latest changes.' },
      { version: '1.2.2', note: '' },
    ])
  })

  it('returns an empty array for null', () => {
    expect(normalizeReleaseNotes(makeUpdateInfo(null))).toEqual([])
  })

  it('returns an empty array for undefined', () => {
    expect(normalizeReleaseNotes(makeUpdateInfo(undefined))).toEqual([])
  })

  it('returns an empty array for an empty string', () => {
    expect(normalizeReleaseNotes(makeUpdateInfo(''))).toEqual([])
  })

  it('returns an empty array for an already-empty array', () => {
    expect(normalizeReleaseNotes(makeUpdateInfo([]))).toEqual([])
  })
})
