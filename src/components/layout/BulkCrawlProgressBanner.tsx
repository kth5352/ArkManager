import { DeterminateProgressBar } from '../ui/progress-bar'
import type { BulkCrawlProgressDto } from '../../../shared/types/ipc'

// Fixed/floating rather than inline in a page, since the crawl this reports
// on runs in the background regardless of which page is currently open (see
// useBulkCrawlProgress, mounted once in AppLayout) - it should stay visible
// across navigation instead of disappearing when the user leaves whichever
// library page happened to trigger it.
export function BulkCrawlProgressBanner({ progress }: { progress: BulkCrawlProgressDto | null }) {
  if (!progress) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-64 flex-col gap-1.5 rounded-md border border-border bg-card p-3 shadow-lg">
      <p className="text-xs font-medium">
        DLsite 정보 가져오는 중... ({progress.completed}/{progress.total})
      </p>
      <DeterminateProgressBar value={progress.completed} max={progress.total} />
    </div>
  )
}
