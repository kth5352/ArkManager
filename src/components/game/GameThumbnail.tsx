import { useState } from 'react'
import { buildThumbnailUrl } from '../../services/thumbnailService'
import { useGameCoverImage } from '../../services/metadataService'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface GameThumbnailProps {
  entry: Pick<ScannedEntry, 'path' | 'kind' | 'code'>
}

// For folders, prefers a cover-like image file inside the folder itself
// (thumb:// protocol, see findThumbnailPath); only once that request 404s
// does it fall back to the DLsite cover cached by crawling this entry's code
// (game_metadata.coverImagePath via useGameCoverImage) - lazy, so entries
// that already have a local cover never trigger the fallback query at all.
// A file-kind entry (the common case - most games sit as their original
// .zip/.7z/.rar archive, never extracted into a folder) has nothing local to
// look inside for a cover - thumb:// only ever makes sense for a folder
// (findThumbnailPath does a real directory listing) - so it skips straight
// to the DLsite fallback instead of trying and failing a local lookup first.
// Renders nothing (letting the parent's own bg-muted placeholder show
// through) only once neither a local nor a crawled cover is available.
// Tracks the local failure by path rather than a plain boolean so a
// react-window row/cell recycled for a different entry doesn't keep showing
// a stale failure from whatever entry it last rendered.
export function GameThumbnail({ entry }: GameThumbnailProps) {
  const [localFailedPath, setLocalFailedPath] = useState<string | null>(null)
  const localFailed = localFailedPath === entry.path
  const useFallback = entry.kind !== 'folder' || localFailed
  const { data: fallbackCover } = useGameCoverImage(useFallback ? entry.code : null)

  if (useFallback) {
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
