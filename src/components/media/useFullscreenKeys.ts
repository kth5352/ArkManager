import { useEffect, useRef } from 'react'
import { getFullscreenKeyAction } from './mediaKeyboard'

interface FullscreenKeyState {
  overlayVisible: boolean
  windowFullscreen: boolean
}

interface FullscreenKeyHandlers {
  toggleFullscreen: () => void
  exitFullscreen: () => void
}

/**
 * F / Escape for window fullscreen. Registered in the CAPTURE phase so it runs
 * before page-level bubble handlers (DetailSidebar's Escape, the favorite F);
 * a key it handles is consumed so those never see it. A held-down key's
 * auto-repeat is consumed too but not acted on - otherwise holding F would
 * flip fullscreen on and off at the keyboard repeat rate.
 */
export function useFullscreenKeys(
  state: FullscreenKeyState,
  handlers: FullscreenKeyHandlers
): void {
  const stateRef = useRef(state)
  const handlersRef = useRef(handlers)
  useEffect(() => {
    stateRef.current = state
    handlersRef.current = handlers
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const focused = document.activeElement as HTMLElement | null
      const action = getFullscreenKeyAction(event, focused, stateRef.current)
      if (!action) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.repeat) return
      handlersRef.current[action]()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])
}
