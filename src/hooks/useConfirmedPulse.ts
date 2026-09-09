import { useEffect, useState } from 'react'

// design §4: "즐겨찾기·완료 | 클릭 반응 120ms, 확정된 상태 변경 아이콘 pulse 최대
// 1.12/180ms" - the pulse must fire on the CONFIRMED value (server-round-
// tripped, cache-updated) actually changing, not on the click itself. Driven
// by the value transitioning, not by which code path caused it, so it fires
// identically whether the toggle came from this card's own button or from a
// completely different code path updating the same query cache (e.g.
// useFavoriteShortcut's "press F while hovering" mutation, which is a
// SEPARATE useMutation() instance from any one card's own - there is no
// shared "did my click succeed" flag between them, only the shared
// TanStack Query cache both eventually write through to).
//
// isLoaded distinguishes "the value just changed" from "the value just
// finished loading for the first time" - without it, a game that was
// already favorited before the page even opened would incorrectly pulse
// the instant its data arrives, since `value` transitions from an
// undefined-derived default to its real loaded value exactly like a genuine
// toggle would.
export function useConfirmedPulse<T>(value: T, isLoaded: boolean): boolean {
  const [hydrated, setHydrated] = useState(isLoaded)
  const [prevValue, setPrevValue] = useState(value)
  const [pulsing, setPulsing] = useState(false)

  if (!hydrated && isLoaded) {
    // First real value becomes available - sync silently, no pulse.
    setHydrated(true)
    setPrevValue(value)
  } else if (hydrated && value !== prevValue) {
    setPrevValue(value)
    setPulsing(true)
  }

  useEffect(() => {
    if (!pulsing) return
    const timer = setTimeout(() => setPulsing(false), 180)
    return () => clearTimeout(timer)
  }, [pulsing])

  return pulsing
}
