import { useEffect, useState } from 'react'

// Subscribes to live scan-progress counts only while `active` (typically a
// query's isLoading) is true, and resets to null the moment `active` changes
// in either direction - so a stale count from a previous scan never lingers
// into the next one, and nothing subscribes to the IPC channel while no scan
// is actually in flight. Resets during render (not inside the effect body)
// to match this codebase's render-time-adjustment convention for syncing an
// external/async value into local state (see RatingMemoDialog.tsx).
export function useScanProgress(active: boolean): number | null {
  const [scanned, setScanned] = useState<number | null>(null)
  const [trackedActive, setTrackedActive] = useState(active)

  if (active !== trackedActive) {
    setTrackedActive(active)
    setScanned(null)
  }

  useEffect(() => {
    if (!active) return
    return window.api.scanner.onScanProgress(setScanned)
  }, [active])

  return scanned
}
