import { useCallback, useEffect, useState } from 'react'

export type FullscreenOwnerState = 'media' | 'user' | null

// Tracks this window's fullscreen state (pushed from the main process) and
// who owns it. toggle() always flips; release() only ends fullscreen the
// media UI started (the main process ignores it when the user used F11).
export function useWindowFullscreen(): {
  fullscreen: boolean
  owner: FullscreenOwnerState
  toggle: () => void
  release: () => void
} {
  const [state, setState] = useState<{ fullscreen: boolean; owner: FullscreenOwnerState }>({
    fullscreen: false,
    owner: null,
  })

  useEffect(() => {
    // Subscribe first, then read the real state: a window already fullscreen
    // via F11 before mount must not start as "not fullscreen". A push that
    // lands before the read resolves is newer, so the read only fills the gap.
    let pushed = false
    const off = window.api.window.onFullscreenChanged((next) => {
      pushed = true
      setState(next)
    })
    void window.api.window
      .getFullscreen()
      .then((initial) => {
        if (!pushed) setState(initial)
      })
      .catch(() => {})
    return off
  }, [])

  // The main process flips from the window's real state, so a stale view
  // (initial read still in flight) cannot turn the first press into a no-op.
  const toggle = useCallback(() => {
    void window.api.window.setFullscreen(true, 'media-flip').then(setState)
  }, [])
  const release = useCallback(() => {
    void window.api.window.setFullscreen(false, 'media-release').then(setState)
  }, [])

  return { ...state, toggle, release }
}
