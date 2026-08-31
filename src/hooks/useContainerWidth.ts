import { useEffect, useRef, useState, type RefObject } from 'react'

// A DOM-measurement hook (untested per this project's convention of not
// testing hooks/component rendering - see getPlaylistDetailWidthMode for
// the pure, tested threshold-comparison logic this feeds).
export function useContainerWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}
