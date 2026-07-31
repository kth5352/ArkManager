import { IndeterminateProgressBar } from '../ui/progress-bar'

// Shown alongside a loading skeleton while a recursive scan is in flight
// (see useScanProgress) - `scanned` starts null until the first progress
// tick arrives, so the count only appears once it's real.
export function ScanProgressIndicator({ scanned }: { scanned: number | null }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 pb-4 pt-1 text-xs text-muted-foreground">
      <IndeterminateProgressBar className="max-w-xs" />
      <span>
        {scanned !== null ? `${scanned.toLocaleString()}개 항목 스캔 중...` : '스캔 중...'}
      </span>
    </div>
  )
}
