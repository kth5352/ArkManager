import { useState, type KeyboardEvent } from 'react'
import { Folder as FolderIcon, ImagePlus, Plus } from 'lucide-react'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import {
  usePickMediaThumbnailFile,
  useSetMediaThumbnailFromFile,
} from '../../services/mediaThumbnailService'
import { setMediaThumbnailWithFeedback } from '../../pages/Media/mediaThumbnailFeedback'
import { useTranslation } from '../../i18n/useTranslation'
import { MediaLikeButton } from './MediaLikeButton'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import type { MediaTrack } from '../../stores/mediaPlayerStore'
import type { ScannedEntry } from '../../../shared/types/scanner'

// The grid-view equivalent of MediaTrackRow (MediaPage.tsx) - same actions
// (play/like/set-thumbnail/add-menu), card layout instead of a row. Unlike
// the row (whose action buttons are always visible, there's room in a
// horizontal row), a card is thumbnail-dominant with little spare width, so
// the action buttons live in a hover-only overlay on top of the thumbnail
// (see the brainstorming decision in
// docs/superpowers/specs/2026-09-02-media-tab-grid-view-design.md section
// 1) rather than being permanently visible like the row's.
//
// The whole card (outside that overlay) is clickable to play, mirroring how
// Explorer's own FolderEntryCard (FolderView.tsx) makes its whole card
// clickable rather than just a name label like its row equivalent does -
// a card's thumbnail is the dominant visual target, so click-to-act should
// cover it, unlike a row where the thumbnail is small and unlabeled as an
// interactive target. The overlay itself stops propagation as one unit
// (rather than on each individual button) so a click anywhere inside it -
// including opening the dropdown menu - never also triggers the card's own
// onPlay.
// The card root is a div with role="button" (not a literal <button>) -
// it contains real <button> descendants (the like button, the set-thumbnail
// button, the dropdown trigger), and a <button> can never validly contain
// another <button> in HTML. This mirrors an already-shipped pattern in this
// codebase (PlaylistManagementTab.tsx's sidebar rows: a role="button" div
// wrapping a real play button - flagged Minor/non-blocking in this
// session's own final review of that feature, not a new risk introduced
// here). onKeyDown handles Enter/Space itself since a div doesn't get that
// native <button> activation behavior for free.
function handleCardActivationKey(event: KeyboardEvent, onActivate: () => void): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onActivate()
  }
}

export function MediaTrackCard({
  track,
  cardWidth,
  onPlay,
  onAddToQueue,
  onPlayNext,
  onAddToSavedPlaylist,
}: {
  track: MediaTrack
  cardWidth: number
  onPlay: () => void
  onAddToQueue: () => void
  onPlayNext: () => void
  onAddToSavedPlaylist: () => void
}) {
  const { t } = useTranslation()
  const [thumbFailed, setThumbFailed] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const pickFile = usePickMediaThumbnailFile()
  const setFromFile = useSetMediaThumbnailFromFile()

  const handlePickThumbnail = async (): Promise<void> => {
    const result = await setMediaThumbnailWithFeedback(
      track.path,
      () => pickFile.mutateAsync(),
      (payload) => setFromFile.mutateAsync(payload),
      t
    )
    if (!result) return
    setThumbFailed(false)
    setRefreshToken((v) => v + 1)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      style={{ width: cardWidth }}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-md border border-border bg-card text-left transition-colors hover:bg-accent"
      onClick={onPlay}
      onKeyDown={(e) => handleCardActivationKey(e, onPlay)}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {!thumbFailed && (
          <img
            src={`${buildMediaThumbnailUrl(track.path)}?v=${refreshToken}`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setThumbFailed(true)}
          />
        )}
        <div
          className="absolute inset-x-0 top-0 flex items-center justify-end gap-0.5 bg-gradient-to-b from-black/60 to-transparent p-1 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* text-white (via cn/tailwind-merge, MediaLikeButton.tsx) overrides
              the red/gray liked-state color for legibility against the dark
              gradient scrim - the filled-vs-outline heart (fill=currentColor
              vs none, already in MediaLikeButton) still distinguishes liked
              from not-liked here, just without the red accent. */}
          <MediaLikeButton path={track.path} name={track.name} className="text-white" />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('media.setThumbnail')}
            className="h-6 w-6 shrink-0 text-white hover:text-white"
            onClick={handlePickThumbnail}
          >
            <ImagePlus className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('media.addToPlaylist')}
                className="h-6 w-6 shrink-0 text-white hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onAddToQueue}>
                {t('media.addToPlaylist')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onPlayNext}>{t('media.playNext')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={onAddToSavedPlaylist}>
                {t('media.addToSavedPlaylist')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="p-2">
        <p className="truncate text-xs">{track.name}</p>
      </div>
    </div>
  )
}

// No nested <button> here (no action buttons on a folder card, matching
// the list view's own MediaFolderRow, which likewise has no actions) - a
// literal <button> root is valid and gets native keyboard activation for
// free, unlike MediaTrackCard above.
export function MediaFolderCard({
  entry,
  cardWidth,
  onOpen,
}: {
  entry: ScannedEntry
  cardWidth: number
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      style={{ width: cardWidth }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-md border border-border bg-card text-left transition-colors hover:bg-accent"
      onClick={onOpen}
    >
      <div className="flex aspect-square w-full items-center justify-center bg-muted">
        <FolderIcon className="h-10 w-10 text-muted-foreground" />
      </div>
      <div className="p-2">
        <p className="truncate text-xs">{entry.name}</p>
      </div>
    </button>
  )
}
