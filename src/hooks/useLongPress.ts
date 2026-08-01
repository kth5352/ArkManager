import { useEffect, useRef } from 'react'

interface UseLongPressOptions {
  thresholdMs?: number
}

interface UseLongPressResult {
  handlers: {
    onPointerDown: () => void
    onPointerUp: () => void
    onPointerLeave: () => void
  }
  // A completed long-press still ends in the same pointerup/click pair as a
  // normal tap - the click that follows would otherwise also fire whatever
  // a plain click does (e.g. opening the detail sidebar). Call this from
  // the element's own onClick and skip its normal action when it returns
  // true; it resets itself so the next real click behaves normally again.
  consumeLongPressClick: () => boolean
}

export function useLongPress(
  onLongPress: () => void,
  { thresholdMs = 2000 }: UseLongPressOptions = {}
): UseLongPressResult {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  const clearTimer = (): void => {
    if (timerRef.current === null) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }

  const onPointerDown = (): void => {
    firedRef.current = false
    clearTimer()
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      onLongPress()
    }, thresholdMs)
  }

  const consumeLongPressClick = (): boolean => {
    if (!firedRef.current) return false
    firedRef.current = false
    return true
  }

  // react-window recycles/unmounts rows during scroll - a pointer-down
  // whose timer is still pending when the row scrolls away used to keep
  // running, firing onLongPress ~thresholdMs later for whatever entry that
  // row happened to be showing at press-time (a stale closure), silently
  // activating selection mode on an entry the user isn't even looking at
  // anymore.
  useEffect(() => clearTimer, [])

  return {
    handlers: { onPointerDown, onPointerUp: clearTimer, onPointerLeave: clearTimer },
    consumeLongPressClick,
  }
}
