import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouterState } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { Sidebar } from './Sidebar'
import { BulkCrawlProgressBanner } from './BulkCrawlProgressBanner'
import { useBulkCrawlProgress } from '../../hooks/useBulkCrawlMissingMetadata'
import { MediaPlayerHost } from '../media/MediaPlayerHost'
import { useMediaPlayerSync } from '../../hooks/useMediaPlayerSync'
import { ExcludedEntriesDialog } from './ExcludedEntriesDialog'
import { useTheme } from '../../hooks/useTheme'
import { useMoveEntries, performUndo } from '../../services/fileOpsService'

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const bulkCrawlProgress = useBulkCrawlProgress()
  const { theme } = useTheme()
  useMediaPlayerSync()

  // Global (not scoped to Explorer's TabBar, unlike its own Ctrl+W handler)
  // since a move - and therefore something to undo - can originate from
  // Gallery/List/DetailList's own right-click Move dialog too, not just
  // Explorer. A ref (updated every render, read inside a mount-once effect)
  // avoids re-subscribing the listener on every mutation-object identity
  // change, which useMutation's return value isn't guaranteed to keep
  // stable across renders.
  const moveEntries = useMoveEntries()
  const moveEntriesRef = useRef(moveEntries)
  moveEntriesRef.current = moveEntries

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      // event.altKey excluded so Ctrl+Alt+Z (a distinct, unrelated shortcut
      // in many apps/OSes) doesn't also trigger the move-undo - only a
      // plain Ctrl+Z should.
      if (!event.ctrlKey || event.key !== 'z' || event.altKey) return
      // Same isEditingElsewhere guard TabBar.tsx's own Ctrl+W handler
      // already uses - Ctrl+Z must not hijack a text field's own native
      // undo (e.g. while typing in the rename dialog or the search box).
      const active = document.activeElement
      const isEditingElsewhere =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (isEditingElsewhere) return

      event.preventDefault()
      performUndo(moveEntriesRef.current)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              className="h-full"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MediaPlayerHost />
      <BulkCrawlProgressBanner progress={bulkCrawlProgress} />
      <ExcludedEntriesDialog />
      {/* position="top-right" avoids overlapping BulkCrawlProgressBanner's
          own fixed bottom-4 right-4 position. richColors gives success/error
          toasts distinct color treatment without this app hand-rolling
          variant styling. */}
      <Toaster theme={theme} position="top-right" richColors closeButton />
    </div>
  )
}
