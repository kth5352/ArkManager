import { useState } from 'react'
import { buildThumbnailUrl } from '../../services/thumbnailService'
import { useGameCoverImage } from '../../services/metadataService'
import { useCustomCoverImage, useGameUserData } from '../../services/gameUserDataService'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface GameThumbnailProps {
  entry: Pick<ScannedEntry, 'path' | 'kind' | 'code'>
}

// Priority: a user-set custom cover (see DetailSidebar's "표지 이미지" section,
// mainly meant for code-less entries with no DLsite cover to crawl) always
// wins over everything else - it's an explicit choice. Below that, a
// code-linked entry (backlog item 10) always prefers the crawled DLsite
// cover over a local folder image - a random image sitting in the game's
// own folder is far less reliably "the cover" than the metadata this app
// already crawled specifically for that code. A code-less folder still
// prefers a cover-like image file inside itself (thumb:// protocol, see
// findThumbnailPath); only once that request 404s does it fall back to the
// DLsite cover (game_metadata.coverImagePath via useGameCoverImage) - lazy,
// so a code-less entry whose local thumbnail already loaded successfully
// never triggers the fallback query at all. A code-linked entry is the
// opposite case: it skips the local lookup and goes straight to this same
// fallback query, since it's expected to actually use the crawled cover.
// A file-kind entry (the common case - most games sit as their original
// .zip/.7z/.rar archive, never extracted into a folder) has nothing local to
// look inside for a cover - thumb:// only ever makes sense for a folder
// (findThumbnailPath does a real directory listing) - so it skips straight
// to the DLsite fallback instead of trying and failing a local lookup first.
// Renders nothing (letting the parent's own bg-muted placeholder show
// through) only once none of the three is available.
// Tracks the local failure by path rather than a plain boolean so a
// react-window row/cell recycled for a different entry doesn't keep showing
// a stale failure from whatever entry it last rendered.
export function GameThumbnail({ entry }: GameThumbnailProps) {
  const [localFailedPath, setLocalFailedPath] = useState<string | null>(null)
  const localFailed = localFailedPath === entry.path
  // Shares the same query cache entry as any other useGameUserData(entry)
  // call for this same card/row elsewhere in the tree - not an extra fetch
  // in practice.
  const { data: userData } = useGameUserData(entry)
  const hasCustomCover = !!userData?.customCoverPath
  const useFallback = entry.kind !== 'folder' || localFailed || !!entry.code

  // All three hooks are called unconditionally on every render (each one's
  // own `enabled`/lazy-key argument controls whether it actually fetches) -
  // which branch below ends up rendering must never change how many hooks
  // this component calls.
  const { data: customCoverImage } = useCustomCoverImage(hasCustomCover ? entry : null)
  const { data: fallbackCover } = useGameCoverImage(
    useFallback && !hasCustomCover ? entry.code : null
  )

  if (hasCustomCover) {
    if (!customCoverImage) return null
    return (
      <img src={customCoverImage} alt="" className="h-full w-full object-cover" draggable={false} />
    )
  }

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
