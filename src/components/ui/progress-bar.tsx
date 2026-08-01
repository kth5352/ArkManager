import { cn } from '../../lib/utils'

// An indeterminate loading bar - for operations with no fixed total (a
// recursive filesystem scan, a network crawl), where a determinate
// percentage fill would be a lie. Pair with a live count/label next to it
// when one is known (see useScanProgress).
export function IndeterminateProgressBar({ className }: { className?: string }) {
  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className="h-full w-1/3 rounded-full bg-primary [animation:indeterminate-progress_1.2s_ease-in-out_infinite]" />
    </div>
  )
}

// A real percentage-fill bar - only honest to use when the total is
// actually known (e.g. the bulk metadata crawl queue, which knows exactly
// how many codes are pending). Use IndeterminateProgressBar instead when it
// isn't.
export function DeterminateProgressBar({
  value,
  max,
  className,
}: {
  value: number
  max: number
  className?: string
}) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
