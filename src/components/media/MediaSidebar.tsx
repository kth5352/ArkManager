import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { UI_MOTION } from '../../lib/motion'
import {
  useMediaSidebarWidthQuery,
  useSetMediaSidebarWidthMutation,
} from '../../services/settingsService'
import {
  clampMediaSidebarWidth,
  MEDIA_SIDEBAR_WIDTH_DEFAULT,
} from '../../lib/clampMediaSidebarWidth'
import { useTranslation } from '../../i18n/useTranslation'
import { PlaylistManagementTab } from './PlaylistManagementTab'
import { CurrentQueueTab } from './CurrentQueueTab'
import { LyricsLogTab } from './LyricsLogTab'
import { FolderTreeTab } from './FolderTreeTab'
import { useMediaPlayerStore, type MediaSidebarTab } from '../../stores/mediaPlayerStore'

// Re-exported so callers that only need the tab-name type can import it
// alongside this component instead of reaching into mediaPlayerStore.ts
// directly - the canonical definition still lives there (see its own
// comment) since the active-tab state this type describes is owned there,
// shared between MediaPlayerHost and AppLayout.tsx. No current importer
// actually uses this re-export (both existing references go straight to
// mediaPlayerStore.ts); kept as a convenience surface, not a compatibility
// shim for anything that exists today.
export type { MediaSidebarTab }

interface MediaSidebarProps {
  activeTab: MediaSidebarTab
  onActiveTabChange: (tab: MediaSidebarTab) => void
  onClose: () => void
}

const TABS: MediaSidebarTab[] = ['playlists', 'queue', 'lyrics', 'folder']

// Right-edge panel (opposite ExplorerSidebar, which sits on the left) - the
// resize handle sign mirrors DetailSidebar.tsx (also right-edge), not
// ExplorerSidebar.tsx.
export function MediaSidebar({ activeTab, onActiveTabChange, onClose }: MediaSidebarProps) {
  const { t } = useTranslation()
  const { data: persistedWidth } = useMediaSidebarWidthQuery()
  const setWidthMutation = useSetMediaSidebarWidthMutation()
  const [width, setWidth] = useState(persistedWidth ?? MEDIA_SIDEBAR_WIDTH_DEFAULT)
  const [syncedWidth, setSyncedWidth] = useState(persistedWidth)
  // AppLayout.tsx reserves flow height for FullscreenMediaOverlay's bottom
  // transport bar via a sibling placeholder div, which is SUPPOSED to shrink
  // this sidebar's own `h-full` parent row by the same amount - a live user
  // found that in practice the sidebar still extended down far enough to
  // cover part of that bar (z-[60] over the overlay's z-50 makes it draw on
  // top, not just occupy adjacent space). Rather than continue relying on
  // that row-level shrink working out exactly right, this reads the same
  // measured height directly from the store and subtracts it explicitly -
  // guaranteed correct regardless of any parent flex-sizing subtlety, since
  // it's the same real number FullscreenMediaOverlay's own ResizeObserver
  // reports, not a guess.
  const mediaExpanded = useMediaPlayerStore((s) => s.mediaExpanded)
  const mediaFullscreenBarHeight = useMediaPlayerStore((s) => s.mediaFullscreenBarHeight)
  const isDetached = useMediaPlayerStore((s) => s.isDetached)
  const reserveForFullscreenBar = mediaExpanded && !isDetached

  // Render-time sync, not a useEffect - same pattern ExplorerSidebar.tsx/
  // DetailSidebar.tsx use for their own persisted-width sync.
  if (persistedWidth !== syncedWidth) {
    setSyncedWidth(persistedWidth)
    if (persistedWidth !== undefined) setWidth(persistedWidth)
  }

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = width
    let latestWidth = startWidth

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      // Right-edge panel (mirrors DetailSidebar.tsx's sign, not
      // ExplorerSidebar.tsx's) - dragging left (negative delta) widens it.
      latestWidth = clampMediaSidebarWidth(startWidth + (startX - moveEvent.clientX))
      setWidth(latestWidth)
    }
    const finishDrag = (): void => {
      target.removeEventListener('pointermove', handlePointerMove)
      target.removeEventListener('pointerup', finishDrag)
      target.removeEventListener('pointercancel', finishDrag)
      setWidthMutation.mutate(latestWidth)
    }

    target.addEventListener('pointermove', handlePointerMove)
    target.addEventListener('pointerup', finishDrag)
    target.addEventListener('pointercancel', finishDrag)
  }

  const tabLabel = (tab: MediaSidebarTab): string =>
    tab === 'playlists'
      ? t('media.tabPlaylists')
      : tab === 'queue'
        ? t('media.tabQueue')
        : tab === 'lyrics'
          ? t('media.tabLyrics')
          : t('media.folderTab')

  return (
    <div
      style={{
        width,
        // Explicit height override (see reserveForFullscreenBar's own
        // comment above) - falls back to the h-full class below (undefined
        // lets the CSS class take over) whenever fullscreen's bottom bar
        // isn't showing.
        height: reserveForFullscreenBar ? `calc(100% - ${mediaFullscreenBarHeight}px)` : undefined,
      }}
      // relative (stacking context anchor) + z-[60] - one above
      // FullscreenMediaOverlay's z-50 - keeps this sidebar usable (browsing
      // the queue/lyrics) even while a video is fullscreen. Now a normal
      // flex child (not `fixed`, see AppLayout.tsx), but FullscreenMediaOverlay
      // is still `fixed inset-0 z-50` elsewhere in the tree (only its inner
      // video-area div gets a conditional `marginRight` for this sidebar,
      // not the outer box) - since no ancestor here establishes an isolating
      // stacking context (no transform/opacity/will-change/isolate on the
      // plain flex/block divs in between), this element's z-[60] still
      // stacks correctly against that fixed z-50 sibling per normal CSS
      // stacking rules.
      className="relative z-[60] flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-card"
    >
      <div
        onPointerDown={handleResizePointerDown}
        className="absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/40"
      />
      <div className="flex items-center border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onActiveTabChange(tab)}
            className={cn(
              // min-w-0 lets a flex-1 item shrink below its content's
              // intrinsic width (flex items default to min-width: auto,
              // which refuses to) - required for truncate to actually
              // truncate instead of forcing the row to overflow/wrap.
              // Pretendard renders Korean text wider than the previous
              // system-default font, and the longest label ('재생목록 관리')
              // no longer reliably fits its ~1/4 share of the sidebar's
              // default 320px width - without this it wrapped onto a
              // second line, pushing the whole tab row (and everything
              // below it) down instead of staying a single fixed-height row.
              'relative min-w-0 flex-1 truncate px-2 py-2 text-xs font-medium',
              tab === activeTab
                ? 'text-foreground'
                : 'text-muted-foreground transition-colors hover:text-foreground'
            )}
            title={tabLabel(tab)}
          >
            {/* layoutId scoped to this sidebar only ("media-sidebar-selection"),
                separate from Sidebar.tsx's "app-sidebar-selection" and
                TabBar.tsx's "explorer-tab-selection" - design §4 explicitly
                requires each menu/tab surface to animate its own selection
                independently rather than sharing one layoutId across
                unrelated surfaces. */}
            {tab === activeTab && (
              <motion.span
                layoutId="media-sidebar-selection"
                className="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
                transition={{ duration: UI_MOTION.selection, ease: UI_MOTION.ease }}
              />
            )}
            <span className="relative z-10">{tabLabel(tab)}</span>
          </button>
        ))}
        <button
          type="button"
          aria-label={t('media.sidebarClose')}
          title={t('media.sidebarClose')}
          onClick={onClose}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {activeTab === 'playlists' && <PlaylistManagementTab />}
        {activeTab === 'queue' && <CurrentQueueTab />}
        {/* No playback/parsedLyrics props threaded through here - see
            LyricsLogTab's own top comment for why it sources both itself
            (a store bridge for currentTime/seek, a fresh useMediaLyrics call
            for parsedLyrics) rather than receiving them from this tree,
            which sits outside MediaPlayerHost's (see AppLayout.tsx). */}
        {activeTab === 'lyrics' && <LyricsLogTab />}
        {activeTab === 'folder' && <FolderTreeTab />}
      </div>
    </div>
  )
}
