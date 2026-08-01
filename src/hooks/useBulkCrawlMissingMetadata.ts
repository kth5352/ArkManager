import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { GameCode } from '../../shared/types/scanner'
import type { BulkCrawlProgressDto } from '../../shared/types/ipc'

// Fires once per distinct `codes` array (e.g. once per Gallery/List/
// DetailList mount, or whenever the scanned library changes) - safe to call
// from all three pages at once, since the main-process queue (see
// bulkCrawlQueue.ts) already dedupes by code and only ever runs one crawl
// pass per code per app session.
export function useTriggerBulkCrawlMissingMetadata(codes: GameCode[]): void {
  // All three call sites rebuild `codes` with a new array reference on
  // every render (they .flatMap() it fresh from `games`), and each of those
  // pages also holds unrelated local state (search query, hovered card)
  // that re-renders far more often than the actual game list changes -
  // without this, the effect below re-fires (and re-hits the main
  // process's per-code SQLite lookup for the whole library, see
  // bulkCrawlQueue.ts) on every keystroke/hover instead of only when the
  // set of codes actually changes. Keyed by content (sorted/joined code
  // values) rather than array identity.
  const lastSignatureRef = useRef<string | null>(null)

  useEffect(() => {
    if (codes.length === 0) return
    const signature = codes
      .map((code) => code.value)
      .sort()
      .join(',')
    if (signature === lastSignatureRef.current) return
    lastSignatureRef.current = signature
    window.api.metadata.crawlMissing(codes)
  }, [codes])
}

// Subscribes to the bulk crawl queue's progress globally (mount this once,
// not per-page - see AppLayout) so a banner showing it can survive
// navigating away from whichever library page originally triggered the
// crawl. Returns null whenever nothing is in flight, including once the
// queue drains to completed === total.
export function useBulkCrawlProgress(): BulkCrawlProgressDto | null {
  const [progress, setProgress] = useState<BulkCrawlProgressDto | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    return window.api.metadata.onBulkCrawlProgress((next) => {
      setProgress(next.completed >= next.total ? null : next)
      // Crawling happens entirely in the main process, outside any mutation
      // this app's own React Query cache would normally invalidate on
      // success - without this, newly-crawled titles/genres/covers wouldn't
      // show up until each query's own staleTime happened to expire. Tied
      // to the same ~1/sec cadence the queue itself already crawls at (see
      // bulkCrawlQueue.ts's CRAWL_INTERVAL_MS), so this isn't invalidating
      // any more often than new data can actually arrive.
      queryClient.invalidateQueries({ queryKey: ['metadata'] })
      queryClient.invalidateQueries({ queryKey: ['metadata-many'] })
    })
  }, [queryClient])

  return progress
}
