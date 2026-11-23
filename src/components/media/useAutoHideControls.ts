import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  isHeld,
  isPointerMoveActivity,
  nextHideDelayMs,
  shouldShowControls,
  type HoldReasons,
  type PointerPosition,
} from './autoHide'

interface UseAutoHideControlsOptions {
  enabled: boolean
  hold: HoldReasons
  rootRef: RefObject<HTMLElement | null>
}

// Hides the fullscreen controls (and the cursor) after a period without
// activity. Pure decision logic lives in autoHide.ts; this hook only wires
// events and a single timer. When disabled it installs nothing.
export function useAutoHideControls({ enabled, hold, rootRef }: UseAutoHideControlsOptions): {
  visible: boolean
  bumpActivity: () => void
} {
  const [hidden, setHidden] = useState(false)
  const lastActivityRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdRef = useRef(hold)
  const enabledRef = useRef(enabled)
  const lastPointerRef = useRef<PointerPosition | null>(null)
  const held = isHeld(hold)

  // Hold/enabled transitions reveal the controls (adjusted during render).
  const [prevKey, setPrevKey] = useState({ held, enabled })
  if (prevKey.held !== held || prevKey.enabled !== enabled) {
    setPrevKey({ held, enabled })
    setHidden(false)
  }

  useEffect(() => {
    holdRef.current = hold
    enabledRef.current = enabled
  })

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const schedule = useCallback(() => {
    clearTimer()
    const now = Date.now()
    const delay = nextHideDelayMs(now, lastActivityRef.current, holdRef.current)
    if (delay !== null) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        setHidden(!shouldShowControls(Date.now(), lastActivityRef.current, holdRef.current))
      }, delay)
    }
  }, [clearTimer])

  const bumpActivity = useCallback(() => {
    if (!enabledRef.current) return
    lastActivityRef.current = Date.now()
    setHidden(false)
    schedule()
  }, [schedule])

  // Listeners: only while enabled.
  useEffect(() => {
    if (!enabled) return
    const root = rootRef.current
    const onActivity = (): void => bumpActivity()
    const onPointerMove = (event: Event): void => {
      const { clientX, clientY } = event as MouseEvent
      // An event without coordinates can't be compared; count it.
      if (typeof clientX === 'number' && typeof clientY === 'number') {
        const next = { x: clientX, y: clientY }
        const real = isPointerMoveActivity(lastPointerRef.current, next)
        lastPointerRef.current = next
        if (!real) return
      }
      bumpActivity()
    }
    root?.addEventListener('pointermove', onPointerMove)
    root?.addEventListener('pointerdown', onActivity)
    root?.addEventListener('wheel', onActivity)
    window.addEventListener('keydown', onActivity)
    return () => {
      root?.removeEventListener('pointermove', onPointerMove)
      root?.removeEventListener('pointerdown', onActivity)
      root?.removeEventListener('wheel', onActivity)
      window.removeEventListener('keydown', onActivity)
      clearTimer()
    }
  }, [enabled, rootRef, bumpActivity, clearTimer])

  // Hold changes: while held nothing is scheduled; the moment the last hold
  // clears counts as activity so the controls don't vanish instantly.
  useEffect(() => {
    if (!enabled) return
    lastActivityRef.current = Date.now()
    schedule()
  }, [enabled, held, schedule])

  const visible = !enabled || !hidden

  useEffect(() => {
    const root = rootRef.current
    if (!enabled || visible || !root) return
    const previous = root.style.cursor
    root.style.cursor = 'none'
    return () => {
      root.style.cursor = previous
    }
  }, [enabled, visible, rootRef])

  return { visible, bumpActivity }
}
