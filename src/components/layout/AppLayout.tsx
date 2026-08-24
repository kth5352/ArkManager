import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouterState } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { Sidebar } from './Sidebar'
import { BulkCrawlProgressBanner } from './BulkCrawlProgressBanner'
import { useBulkCrawlProgress } from '../../hooks/useBulkCrawlMissingMetadata'
import { MediaPlayerHost } from '../media/MediaPlayerHost'
import { MediaSidebar } from '../media/MediaSidebar'
import { useMediaPlayerSync } from '../../hooks/useMediaPlayerSync'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { ExcludedEntriesDialog } from './ExcludedEntriesDialog'
import { useTheme } from '../../hooks/useTheme'
import { useMoveEntries, performUndo } from '../../services/fileOpsService'
import {
  useMediaSidebarOpenQuery,
  useSetMediaSidebarOpenMutation,
} from '../../services/settingsService'

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const bulkCrawlProgress = useBulkCrawlProgress()
  const { theme } = useTheme()
  useMediaPlayerSync()

  const sidebarActiveTab = useMediaPlayerStore((s) => s.sidebarActiveTab)
  const setSidebarActiveTab = useMediaPlayerStore((s) => s.setSidebarActiveTab)
  const { data: mediaSidebarOpenSetting, isLoading: mediaSidebarOpenLoading } =
    useMediaSidebarOpenQuery()
  const setMediaSidebarOpenMutation = useSetMediaSidebarOpenMutation()
  // Falls back to closed (false), matching useMediaSidebarOpenQuery's own
  // default - see that function's comment. Only matters for the instant
  // before the query resolves anyway, since mediaSidebarOpenLoading already
  // gates rendering below.
  const mediaSidebarOpen = mediaSidebarOpenSetting ?? false

  // Global (not scoped to Explorer's TabBar, unlike its own Ctrl+W handler)
  // since a move - and therefore something to undo - can originate from
  // Gallery/List/DetailList's own right-click Move dialog too, not just
  // Explorer. A ref (kept in sync by an effect, read inside a mount-once effect)
  // avoids re-subscribing the listener on every mutation-object identity
  // change, which useMutation's return value isn't guaranteed to keep
  // stable across renders.
  const moveEntries = useMoveEntries()
  const moveEntriesRef = useRef(moveEntries)

  useEffect(() => {
    moveEntriesRef.current = moveEntries
  }, [moveEntries])

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
        {/* Real flex sibling of Sidebar/main (matches DetailSidebar's own
            pattern) rather than a `fixed` overlay - this is what makes it
            push `<main>`'s width instead of floating on top of
            DetailSidebar/BulkCrawlProgressBanner, which both live outside
            this row. MediaSidebar's own root still carries `relative
            z-[60]` (see MediaSidebar.tsx) so it keeps painting above
            FullscreenMediaOverlay's `fixed top-0 bottom-0 left-0 z-50` (rendered
            elsewhere, inside MediaPlayerHost, with a conditional `right` inset
            rather than a plain `inset-0` - narrows it to make room for this
            sidebar on /media) whenever both are visible at once - plain
            flex/block divs like this row and this component's own root don't
            establish an isolating stacking context, so that fixed z-50
            element and this relative z-[60] element still stack against each
            other by z-index alone, regardless of DOM position. */}
        {/* No longer gated on whether a track is queued (currentIndex !==
            null) - the sidebar's playlist-management tab is a persistent
            feature (create/rename/delete/play saved playlists, reachable
            from a context-menu action with nothing playing) that has no
            business being tied to playback state; only the queue/lyrics
            tabs legitimately need something playing, and both already
            degrade to their own empty-state UI when playlist/currentIndex
            are empty (see CurrentQueueTab's `playlist.length === 0` guard
            and LyricsLogTab's `parsedLyrics === null` guard, the latter
            fed by useMediaLyrics(null) short-circuiting via its own
            `enabled: trackPath !== null`). */}
        {pathname === '/media' && !mediaSidebarOpenLoading && mediaSidebarOpen && (
          <MediaSidebar
            activeTab={sidebarActiveTab}
            onActiveTabChange={setSidebarActiveTab}
            onClose={() => setMediaSidebarOpenMutation.mutate(false)}
          />
        )}
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
