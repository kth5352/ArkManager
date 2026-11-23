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

  useEffect(() => window.api.window.onFullscreenChanged((next) => setState(next)), [])

  const toggle = useCallback(() => {
    void window.api.window.setFullscreen(!state.fullscreen, 'media-toggle').then(setState)
  }, [state.fullscreen])
  const release = useCallback(() => {
    void window.api.window.setFullscreen(false, 'media-release').then(setState)
  }, [])

  return { ...state, toggle, release }
}
