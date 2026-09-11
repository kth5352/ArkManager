import { crawlGameMetadataWithTrace } from './crawlGameMetadata'
import { cacheCoverImage } from './cacheCoverImage'
import {
  getGameMetadata,
  saveGameMetadata,
  setGameMetadataCoverPath,
} from '../database/gameMetadataRepository'
import {
  getMetadataFailure,
  saveMetadataFailure,
  clearMetadataFailure,
} from '../database/metadataFailuresRepository'
import type { GameCode } from '../../../shared/types/scanner'
import type { BulkCrawlProgressDto } from '../../../shared/types/ipc'
import type { AppDatabase } from '../database/client'

// 1 request/sec, per explicit user choice - DLsite has no documented rate
// limit, and a real library can have dozens to hundreds of filename-
// recognized codes that have never been crawled (the only things that
// trigger a crawl elsewhere are a direct DLsite search or manually linking
// a code, which explicitly crawls right after linking - see
// CodeLinkSection.tsx/LinkCodeDialog.tsx). Hammering DLsite with all of
// them in parallel risks this app's IP getting rate-limited or blocked.
const CRAWL_INTERVAL_MS = 1000

export interface BulkCrawlQueue {
  // Adds any code with no game_metadata row AND no recorded metadata_failures
  // row yet, and not already attempted this session. A code that fails to
  // crawl (delisted, blocked, network/parse error) gets a persisted failure
  // row (see processNext) specifically so this filter can keep skipping it
  // on every LATER call too, including a fresh app launch - a live user
  // found that before this, a code that failed once was silently retried on
  // every single app launch forever: nothing distinguished "never
  // attempted" from "attempted and failed" once the in-memory `attempted`
  // Set below reset on restart, since a failed crawl left neither a
  // game_metadata row nor any other record behind. Safe to call repeatedly
  // with overlapping code lists (e.g. once per library page mount) -
  // already-queued/attempted codes are skipped, and a call while the queue
  // is already processing just adds to it rather than starting a second
  // concurrent worker.
  enqueue(codes: GameCode[], onProgress: (progress: BulkCrawlProgressDto) => void): void
  // "전체 메타데이터 새로고침"/"Refresh All Metadata" (File menu) - unlike
  // enqueue, never skips a code just because it already has a game_metadata
  // row (the entire point is overwriting it with a fresh crawl) or because
  // it was already attempted this session. saveGameMetadata's own
  // onConflictDoUpdate already handles the overwrite; this only needed to
  // stop enqueue's own filtering from skipping it. Still marks every code
  // `attempted` so a concurrent passive enqueue() call (a library page
  // mounting mid-refresh) doesn't also queue the same code a second time.
  forceEnqueue(codes: GameCode[], onProgress: (progress: BulkCrawlProgressDto) => void): void
}

export function createBulkCrawlQueue(db: AppDatabase, cacheDir: string): BulkCrawlQueue {
  const attempted = new Set<string>()
  const pending: GameCode[] = []
  let processing = false
  let completed = 0
  let total = 0
  let reportProgress: ((progress: BulkCrawlProgressDto) => void) | null = null

  async function processNext(): Promise<void> {
    const code = pending.shift()
    if (!code) {
      processing = false
      completed = 0
      total = 0
      return
    }

    try {
      const { metadata, attemptedSources, reason } = await crawlGameMetadataWithTrace(code)
      if (metadata) {
        saveGameMetadata(db, code.value, metadata)
        // Clears any stale failure from an earlier attempt - only reachable
        // here via forceEnqueue (enqueue's own filter already skips a code
        // with a failure row), but a successful re-crawl must not leave a
        // now-wrong failure record behind for other readers (e.g.
        // DetailSidebar's useMetadataFailure) to keep showing.
        clearMetadataFailure(db, code.value)
        if (metadata.coverImageUrl) {
          const coverPath = await cacheCoverImage(cacheDir, code.value, metadata.coverImageUrl)
          if (coverPath) setGameMetadataCoverPath(db, code.value, coverPath)
        }
      } else {
        // reason is only null when metadata is non-null (see
        // CrawlTraceResult) - the ?? fallback is for TypeScript, not a real
        // runtime case.
        saveMetadataFailure(db, code.value, attemptedSources, reason ?? 'blocked')
      }
    } catch {
      // Best-effort - crawlGameMetadataWithTrace already turns a real
      // network/parse/etc. failure into a `reason` above instead of
      // rejecting (see its own per-source try/catch) - this only guards
      // against something else in this block throwing unexpectedly (e.g.
      // saveGameMetadata/cacheCoverImage itself), so one such code still
      // can't stop the rest of the queue from being attempted.
    }

    completed += 1
    // reportProgress is the caller's event.sender.send(...) - it throws if
    // the window that originally called enqueue() has since been closed
    // (e.g. the user closed the app or navigated away mid-crawl). That throw
    // used to happen OUTSIDE this try/catch, so it propagated out of this
    // async function as an unhandled rejection and the setTimeout below was
    // never reached - `processing` then stayed true forever (only reset at
    // the empty-queue branch above, which this code path never got back to),
    // silently killing bulk crawling for the rest of the session: every
    // later enqueue() would see processing === true and never restart the
    // worker. Reporting progress is best-effort, same as the crawl attempt
    // itself just above - a failure to notify a closed window must not stop
    // the remaining queue from being processed.
    try {
      reportProgress?.({ completed, total })
    } catch {
      // Best-effort - see comment above.
    }
    setTimeout(processNext, CRAWL_INTERVAL_MS)
  }

  // Shared by enqueue and forceEnqueue - both just differ in which codes
  // from their input actually make it into `newCodes` before calling this.
  function pushAndStart(
    newCodes: GameCode[],
    onProgress: (progress: BulkCrawlProgressDto) => void
  ): void {
    reportProgress = onProgress
    if (newCodes.length === 0) return
    for (const code of newCodes) attempted.add(code.value)

    pending.push(...newCodes)
    total += newCodes.length
    // Best-effort - see processNext's own comment on why a throw here
    // (the calling window already closed) must not propagate.
    try {
      reportProgress({ completed, total })
    } catch {
      // Best-effort - see above.
    }

    if (!processing) {
      processing = true
      processNext()
    }
  }

  return {
    enqueue(codes, onProgress) {
      const newCodes = codes.filter(
        (code) =>
          !attempted.has(code.value) &&
          !getGameMetadata(db, code.value) &&
          !getMetadataFailure(db, code.value)
      )
      pushAndStart(newCodes, onProgress)
    },
    forceEnqueue(codes, onProgress) {
      pushAndStart(codes, onProgress)
    },
  }
}
