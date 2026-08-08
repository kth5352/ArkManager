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

  it('converts GitHub HTML release notes into readable plain text', () => {
    const info = makeUpdateInfo(
      '<p>Ark Manager 1.1.0</p><p>미디어</p><ul><li>가사를 표시합니다.</li><li><strong>WAV</strong> 커버를 지원합니다.</li></ul>'
    )

    expect(normalizeReleaseNotes(info)).toEqual([
      {
        version: '1.2.3',
        note: 'Ark Manager 1.1.0\n\n미디어\n\n- 가사를 표시합니다.\n- WAV 커버를 지원합니다.',
      },
    ])
  })

  it('removes active and hidden HTML content from release notes', () => {
    const info = makeUpdateInfo(
      '<p>Safe text</p><script>alert("unsafe")</script><style>.hidden { display: none; }</style><template>hidden</template>'
    )

    expect(normalizeReleaseNotes(info)).toEqual([{ version: '1.2.3', note: 'Safe text' }])
  })

  it('passes an array (fullChangelog: true shape) through, defaulting a null note to an empty string', () => {
    const info = makeUpdateInfo([
      { version: '1.2.3', note: '<p>Latest changes.</p>' },
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
