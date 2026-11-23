import { useCallback, useEffect, useState } from 'react'

export type FullscreenOwnerState = 'media' | 'user' | null

// The hook's view can be stale (window already fullscreen via F11 before
// mount): a request that leaves the state unchanged is retried once inverted.
export function shouldRetryToggle(previous: boolean, returned: boolean): boolean {
  return returned === previous
}

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

  useEffect(() => window.api.window.onFullscreenChanged((next) => setState(next)), [])

  const toggle = useCallback(() => {
    const previous = state.fullscreen
    void window.api.window
      .setFullscreen(!previous, 'media-toggle')
      .then((result) =>
        shouldRetryToggle(previous, result.fullscreen)
          ? window.api.window.setFullscreen(previous, 'media-toggle')
          : result
      )
      .then(setState)
  }, [state.fullscreen])
  const release = useCallback(() => {
    void window.api.window.setFullscreen(false, 'media-release').then(setState)
  }, [])

  return { ...state, toggle, release }
}
