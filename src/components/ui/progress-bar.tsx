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
