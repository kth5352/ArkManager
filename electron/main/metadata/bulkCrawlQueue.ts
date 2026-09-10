import { crawlGameMetadata } from './crawlGameMetadata'
import { cacheCoverImage } from './cacheCoverImage'
import {
  getGameMetadata,
  saveGameMetadata,
  setGameMetadataCoverPath,
} from '../database/gameMetadataRepository'
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
  // Adds any code with no game_metadata row yet and not already attempted
  // this session (covers "crawled but the work turned out to be delisted" -
  // retrying that every time a page mounts would just be wasted traffic).
  // Safe to call repeatedly with overlapping code lists (e.g. once per
  // library page mount) - already-queued/attempted codes are skipped, and a
  // call while the queue is already processing just adds to it rather than
  // starting a second concurrent worker.
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
      const crawled = await crawlGameMetadata(code)
      if (crawled) {
        saveGameMetadata(db, code.value, crawled)
        if (crawled.coverImageUrl) {
          const coverPath = await cacheCoverImage(cacheDir, code.value, crawled.coverImageUrl)
          if (coverPath) setGameMetadataCoverPath(db, code.value, coverPath)
        }
      }
    } catch {
      // Best-effort - one failing/timed-out code shouldn't stop the rest of
      // the queue from being attempted.
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
        (code) => !attempted.has(code.value) && !getGameMetadata(db, code.value)
      )
      pushAndStart(newCodes, onProgress)
    },
    forceEnqueue(codes, onProgress) {
      pushAndStart(codes, onProgress)
    },
  }
}
