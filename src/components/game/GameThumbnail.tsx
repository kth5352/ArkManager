import { useState } from 'react'
import { buildThumbnailUrl } from '../../services/thumbnailService'
import { useGameCoverImage } from '../../services/metadataService'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface GameThumbnailProps {
  entry: Pick<ScannedEntry, 'path' | 'kind' | 'code'>
}

// Renders nothing (letting the parent's own bg-muted placeholder show
// through) for files. For folders, prefers a cover-like image file inside
// the folder itself (thumb:// protocol, see findThumbnailPath); only once
// that request 404s does it fall back to the DLsite cover cached by
// crawling this entry's code (game_metadata.coverImagePath via
// useGameCoverImage) - lazy, so entries that already have a local cover
// never trigger the fallback query at all. Tracks the local failure by path
// rather than a plain boolean so a react-window row/cell recycled for a
// different entry doesn't keep showing a stale failure from whatever entry
// it last rendered.
export function GameThumbnail({ entry }: GameThumbnailProps) {
  const [localFailedPath, setLocalFailedPath] = useState<string | null>(null)
  const localFailed = localFailedPath === entry.path
  const { data: fallbackCover } = useGameCoverImage(
    entry.kind === 'folder' && localFailed ? entry.code : null
  )

  if (entry.kind !== 'folder') return null

  if (localFailed) {
    if (!fallbackCover) return null
    return (
      <img src={fallbackCover} alt="" className="h-full w-full object-cover" draggable={false} />
    )
  }

  return (
    <img
      src={buildThumbnailUrl(entry.path)}
      alt=""
      className="h-full w-full object-cover"
      draggable={false}
      onError={() => setLocalFailedPath(entry.path)}
    />
  )
}
