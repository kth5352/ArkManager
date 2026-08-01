import { useNavigate } from '@tanstack/react-router'
import { useRecentlyPlayed } from '../../services/gameUserDataService'
import { useGameCoverImage, useGameMetadata } from '../../services/metadataService'
import { useGameUserData } from '../../services/gameUserDataService'
import { usePendingGalleryOpenStore } from '../../stores/pendingGalleryOpenStore'
import { formatPlaytime } from './formatPlaytime'
import { useTranslation } from '../../i18n/useTranslation'
import type { GameCode } from '../../../shared/types/scanner'

function codeFromKey(key: string): GameCode | null {
  const match = /^(RJ|VJ|ST)(\d+)$/.exec(key)
  if (!match) return null
  return { type: match[1] as GameCode['type'], value: key }
}

function RecentlyPlayedRow({ entryKey, lastPlayedAt }: { entryKey: string; lastPlayedAt: string }) {
  const { t } = useTranslation()
  const code = codeFromKey(entryKey)
  const { data: metadata } = useGameMetadata(code)
  const { data: userData } = useGameUserData({ code, path: code ? '' : entryKey })
  // Reads the cached DLsite cover directly by code, not GameThumbnail's
  // local-folder-file lookup - this page's whole point (per the original
  // design) is staying useful after the game's own files are gone, so it
  // must never touch the filesystem path at all.
  const { data: coverImage } = useGameCoverImage(metadata?.coverImagePath ? code : null)
  const navigate = useNavigate()
  const setPendingKey = usePendingGalleryOpenStore((s) => s.setPendingKey)

  const handleClick = (): void => {
    setPendingKey(entryKey)
    navigate({ to: '/' })
  }

  return (
    <button
      onClick={handleClick}
      className="flex w-full items-center gap-3 border-b border-border px-4 py-2 text-left text-sm transition-colors hover:bg-accent"
    >
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
        {coverImage && (
          <img src={coverImage} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </div>
      <span className="flex-1">{metadata?.title ?? entryKey}</span>
      <span className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatPlaytime(userData?.totalPlaytimeMs ?? 0, t)}</span>
        <span>{lastPlayedAt.slice(0, 10)}</span>
      </span>
    </button>
  )
}

export function RecentlyPlayedPage() {
  const { t } = useTranslation()
  const { data: recent, isLoading } = useRecentlyPlayed()

  if (isLoading || !recent) return null

  if (recent.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('recentlyPlayed.empty')}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {recent.map((entry) => (
        <RecentlyPlayedRow key={entry.key} entryKey={entry.key} lastPlayedAt={entry.lastPlayedAt} />
      ))}
    </div>
  )
}
