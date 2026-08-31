import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Play, Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import {
  useMediaPlaylists,
  useMediaPlaylistTracks,
  useCreateMediaPlaylist,
  useLikedTracks,
  LIKED_PLAYLIST_ID,
} from '../../services/mediaPlaylistService'
import { useTranslation } from '../../i18n/useTranslation'
import { MarqueeText } from '../ui/marquee-text'
import { PlaylistThumbnail } from './PlaylistThumbnail'
import { computePlaylistThumbnailSource } from '../../lib/playlistThumbnailSources'
import type { MediaPlaylistDto } from '../../../shared/types/ipc'

// The "좋아요" entry is a virtual playlist backed entirely by
// useLikedTracks() - it never has a row in media_playlists, so it has no
// rename/delete/cover-set affordance. Clicking it navigates to the same
// PlaylistDetailView as a real saved playlist (using the synthetic
// LIKED_PLAYLIST_ID), which renders a read-only variant for it.
function LikedPlaylistRow() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: liked = [] } = useLikedTracks()
  const playNow = useMediaPlayerStore((s) => s.playNow)
  const navigateToPlaylistDetail = useMediaPlayerStore((s) => s.navigateToPlaylistDetail)

  const tracks = liked.map((track) => ({
    path: track.path,
    name: track.path.split(/[\\/]/).pop() ?? track.path,
  }))
  const thumbnailSource = computePlaylistThumbnailSource(
    false,
    LIKED_PLAYLIST_ID,
    tracks.map((track) => track.path)
  )

  const openDetail = (): void => {
    navigateToPlaylistDetail(LIKED_PLAYLIST_ID)
    navigate({ to: '/media' })
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => e.key === 'Enter' && openDetail()}
      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm transition-colors hover:bg-accent"
    >
      <PlaylistThumbnail source={thumbnailSource} size="sm" />
      <span className="min-w-0 flex-1 truncate font-medium">{t('media.likedPlaylistName')}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        disabled={tracks.length === 0}
        aria-label={t('media.playPlaylist')}
        onClick={(e) => {
          e.stopPropagation()
          if (tracks.length > 0) playNow(tracks[0], tracks)
        }}
      >
        <Play className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// Fetches its own tracks (not just when a detail view is open) so the ▶
// button can play immediately and the row's own thumbnail can be computed -
// the same query key PlaylistDetailView re-derives, so opening the detail
// view right after clicking a row is not a second fetch.
function UserPlaylistRow({ playlist }: { playlist: MediaPlaylistDto }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: tracks = [] } = useMediaPlaylistTracks(playlist.id)
  const playNow = useMediaPlayerStore((s) => s.playNow)
  const navigateToPlaylistDetail = useMediaPlayerStore((s) => s.navigateToPlaylistDetail)
  // Reads the same store-held coverVersions map PlaylistDetailView bumps
  // (see mediaPlayerStore.ts's own comment) so editing a cover there is
  // reflected here too, without needing this row to remount (I1 re-review
  // gap 1).
  const coverVersion = useMediaPlayerStore((s) => s.coverVersions[playlist.id] ?? 0)
  const thumbnailSource = computePlaylistThumbnailSource(
    playlist.coverImagePath !== null,
    playlist.id,
    tracks.map((track) => track.path),
    coverVersion
  )

  const openDetail = (): void => {
    navigateToPlaylistDetail(playlist.id)
    navigate({ to: '/media' })
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => e.key === 'Enter' && openDetail()}
      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm transition-colors hover:bg-accent"
    >
      <PlaylistThumbnail source={thumbnailSource} size="sm" />
      <MarqueeText text={playlist.name} className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        disabled={tracks.length === 0}
        aria-label={t('media.playPlaylist')}
        onClick={(e) => {
          e.stopPropagation()
          if (tracks.length > 0) playNow(tracks[0], tracks)
        }}
      >
        <Play className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

export function PlaylistManagementTab() {
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const { data: playlists = [] } = useMediaPlaylists()
  const createMutation = useCreateMediaPlaylist()
  // Enter unmounts this Input (setCreating(false)), and browsers fire a
  // synchronous 'blur' on the still-focused node as part of that removal -
  // which re-invokes this exact same commitCreate closure via onBlur before
  // any re-render can happen. A createMutation.isPending check would not
  // catch this: both invocations read the same per-render snapshot. A ref
  // mutates in place and is visible to the second call immediately.
  const committedRef = useRef(false)

  const commitCreate = (): void => {
    if (committedRef.current) return
    committedRef.current = true
    const trimmed = newName.trim()
    if (trimmed) createMutation.mutate(trimmed)
    setNewName('')
    setCreating(false)
  }

  return (
    <div className="flex flex-col gap-1">
      <LikedPlaylistRow />
      {playlists.length === 0 && !creating && (
        <p className="px-1 py-2 text-xs text-muted-foreground">{t('media.emptyPlaylists')}</p>
      )}
      {playlists.map((playlist) => (
        <UserPlaylistRow key={playlist.id} playlist={playlist} />
      ))}
      {creating ? (
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={commitCreate}
          onKeyDown={(e) => e.key === 'Enter' && commitCreate()}
          placeholder={t('media.newPlaylistNamePlaceholder')}
          className="h-7 text-sm"
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-1"
          onClick={() => {
            committedRef.current = false
            setCreating(true)
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('media.createPlaylist')}
        </Button>
      )}
    </div>
  )
}
