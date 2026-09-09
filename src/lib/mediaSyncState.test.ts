import { describe, expect, it } from 'vitest'
import { sameMediaSyncState, toMediaSyncState } from './mediaSyncState'
import type { MediaSyncState } from '../../shared/types/ipc'

function baseState(): MediaSyncState {
  return {
    playlist: [{ path: 'D:\\Media\\a.mp3', name: 'a' }],
    currentIndex: 0,
    isPlaying: true,
    volume: 0.8,
    previousVolume: 1,
    repeatMode: 'off',
    shuffleMode: false,
    shuffleOrder: [0],
    shufflePosition: 0,
    isDetached: false,
  }
}

describe('toMediaSyncState', () => {
  it('projects only the 10 sync-relevant fields, dropping anything else on the input object', () => {
    const withExtra = { ...baseState(), mediaExpanded: true, sidebarActiveTab: 'queue' } as unknown as MediaSyncState
    const projected = toMediaSyncState(withExtra)
    expect(Object.keys(projected).sort()).toEqual(
      [
        'currentIndex',
        'isDetached',
        'isPlaying',
        'playlist',
        'previousVolume',
        'repeatMode',
        'shuffleMode',
        'shuffleOrder',
        'shufflePosition',
        'volume',
      ].sort()
    )
  })
})

describe('sameMediaSyncState', () => {
  it('returns true for two states with identical field values (same references)', () => {
    const state = baseState()
    expect(sameMediaSyncState(toMediaSyncState(state), toMediaSyncState(state))).toBe(true)
  })

  it('returns true when unrelated object identity differs but every field is reference-equal', () => {
    const state = baseState()
    const a = toMediaSyncState(state)
    const b = toMediaSyncState({ ...state })
    expect(a).not.toBe(b)
    expect(sameMediaSyncState(a, b)).toBe(true)
  })

  const fieldChanges: Array<[keyof MediaSyncState, unknown]> = [
    ['playlist', [{ path: 'D:\\Media\\b.mp3', name: 'b' }]],
    ['currentIndex', 1],
    ['isPlaying', false],
    ['volume', 0.5],
    ['previousVolume', 0.5],
    ['repeatMode', 'all'],
    ['shuffleMode', true],
    ['shuffleOrder', [1, 0]],
    ['shufflePosition', 1],
    ['isDetached', true],
  ]

  it.each(fieldChanges)('detects a change in %s as not equal', (field, newValue) => {
    const a = baseState()
    const b: MediaSyncState = { ...a, [field]: newValue }
    expect(sameMediaSyncState(a, b)).toBe(false)
  })

  it('treats a new array with the SAME elements but a different reference as changed (deliberately reference-based, not deep)', () => {
    const a = baseState()
    const b: MediaSyncState = { ...a, playlist: [...a.playlist] }
    // This is the documented tradeoff: sameMediaSyncState trusts the
    // store's own immutable-update contract (a real content change always
    // produces a new array reference; an unrelated re-render never does)
    // rather than deep-comparing playlist/shuffleOrder on every check.
    expect(sameMediaSyncState(a, b)).toBe(false)
  })
})
