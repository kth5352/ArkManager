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
    reportProgress?.({ completed, total })
    setTimeout(processNext, CRAWL_INTERVAL_MS)
  }

  return {
    enqueue(codes, onProgress) {
      reportProgress = onProgress
      const newCodes = codes.filter(
        (code) => !attempted.has(code.value) && !getGameMetadata(db, code.value)
      )
      if (newCodes.length === 0) return
      for (const code of newCodes) attempted.add(code.value)

      pending.push(...newCodes)
      total += newCodes.length
      reportProgress({ completed, total })

      if (!processing) {
        processing = true
        processNext()
      }
    },
  }
}
