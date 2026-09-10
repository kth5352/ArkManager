import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouterState } from '@tanstack/react-router'
import { UI_MOTION } from '../../lib/motion'
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
        {/* min-w-0/min-h-0: without these, a flex item defaults to a min
            size equal to its content's intrinsic size, not 0 - a page with
            a wide table/list (DetailList's own columns) could then push
            `main` itself wider than the row instead of scrolling inside its
            own overflow-auto, and/or force the row taller than the viewport.
            Sidebar/MediaSidebar's own scroll responsibilities are
            unaffected - they're not flex-1 here, so they already size to
            their own content. */}
        <main className="min-h-0 min-w-0 flex-1 overflow-auto">
          {/* design §4: page transition is 160ms opacity + up to 4px move
              (was 150ms/8px). y itself is automatically suppressed to 0
              under reduced motion by main.tsx's MotionConfig
              reducedMotion="user" - framer-motion strips transform-affecting
              values from every animation under that root when the OS
              prefers-reduced-motion is on, leaving only the opacity fade -
              no extra per-component reduced-motion branching needed here. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              className="h-full"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: UI_MOTION.normal }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
        {/* Real flex sibling of Sidebar/main (matches DetailSidebar's own
            pattern) rather than a `fixed` overlay while docked - this is
            what makes it push `<main>`'s width instead of floating on top
            of DetailSidebar/BulkCrawlProgressBanner, which both live
            outside this row. While FullscreenMediaOverlay's bottom bar is
            showing though, MediaSidebar switches itself to `position:
            fixed` (top/right/bottom pinned directly, no computed height at
            all) rather than trusting this row's own height to already
            exclude that bar - see MediaSidebar.tsx's own comment for why
            (two earlier approaches computed that height by hand from this
            row's size and never quite matched). This row is left to grow
            to full height in that state regardless (MediaPlayerHost
            contributes zero flow height then, and
            BulkCrawlProgressBanner/ExcludedEntriesDialog/Toaster are all
            fixed/portal-based, so nothing else in flow needs the space
            back) - harmless since Sidebar/main are hidden behind the
            overlay's opaque background either way, and MediaSidebar no
            longer participates in this row's flex sizing once it's
            `fixed`. */}
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
