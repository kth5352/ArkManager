import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
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
import type { MediaSidebarTab } from '../../stores/mediaPlayerStore'

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

const TABS: MediaSidebarTab[] = ['playlists', 'queue', 'lyrics']

// Right-edge panel (opposite ExplorerSidebar, which sits on the left) - the
// resize handle sign mirrors DetailSidebar.tsx (also right-edge), not
// ExplorerSidebar.tsx.
export function MediaSidebar({ activeTab, onActiveTabChange, onClose }: MediaSidebarProps) {
  const { t } = useTranslation()
  const { data: persistedWidth } = useMediaSidebarWidthQuery()
  const setWidthMutation = useSetMediaSidebarWidthMutation()
  const [width, setWidth] = useState(persistedWidth ?? MEDIA_SIDEBAR_WIDTH_DEFAULT)
  const [syncedWidth, setSyncedWidth] = useState(persistedWidth)

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
    tab === 'playlists' ? t('media.tabPlaylists') : tab === 'queue' ? t('media.tabQueue') : t('media.tabLyrics')

  return (
    <div
      style={{ width }}
      // relative (stacking context anchor) + z-[60] - one above
      // FullscreenMediaOverlay's z-50 - keeps this sidebar usable (browsing
      // the queue/lyrics) even while a video is fullscreen. Now a normal
      // flex child (not `fixed`, see AppLayout.tsx), but FullscreenMediaOverlay
      // is still `fixed inset-0 z-50` elsewhere in the tree - since no
      // ancestor here establishes an isolating stacking context (no
      // transform/opacity/will-change/isolate on the plain flex/block divs in
      // between), this element's z-[60] still stacks correctly against that
      // fixed z-50 sibling per normal CSS stacking rules.
      className="relative z-[60] flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-card"
    >
      <div
        onPointerDown={handleResizePointerDown}
        className="absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize hover:bg-primary/40"
      />
      <div className="flex items-center border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onActiveTabChange(tab)}
            className={cn(
              'flex-1 px-2 py-2 text-xs font-medium',
              tab === activeTab
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tabLabel(tab)}
          </button>
        ))}
        <button
          type="button"
          aria-label={t('media.sidebarClose')}
          title={t('media.sidebarClose')}
          onClick={onClose}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
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
      </div>
    </div>
  )
}
