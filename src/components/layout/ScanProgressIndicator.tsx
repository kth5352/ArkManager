import { IndeterminateProgressBar } from '../ui/progress-bar'
import { useTranslation } from '../../i18n/useTranslation'

// Shown alongside a loading skeleton while a recursive scan is in flight
// (see useScanProgress) - `scanned` starts null until the first progress
// tick arrives, so the count only appears once it's real.
export function ScanProgressIndicator({ scanned }: { scanned: number | null }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-1.5 px-6 pb-4 pt-1 text-xs text-muted-foreground">
      <IndeterminateProgressBar className="max-w-xs" />
      <span>
        {scanned !== null
          ? t('scan.progressWithCount', { count: scanned.toLocaleString() })
          : t('scan.progress')}
      </span>
    </div>
  )
}
