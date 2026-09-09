import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { UI_MOTION } from '../../lib/motion'

interface CollapsibleSectionProps {
  title: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}

// Shared by LaunchConfigSection/CodeLinkSection/SaveDataSection, which all
// had the identical chevron-button + `{expanded && (...)}` pattern
// duplicated 3 times with no transition at all - content used to appear/
// disappear instantly. design §4: "접이 섹션은 실제 콘텐츠 높이 변화에만 200ms
// 전환" - height:'auto' is one of the few values framer-motion can actually
// animate directly (it measures the element), which is what makes this
// possible without a fixed pixel height per section.
export function CollapsibleSection({
  title,
  expanded,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="border-t border-border pt-3">
      <button
        className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground"
        onClick={onToggle}
      >
        <ChevronRight
          className={cn('h-3 w-3 transition-transform duration-160', expanded && 'rotate-90')}
        />
        {title}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: UI_MOTION.panel, ease: UI_MOTION.ease }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-col gap-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
