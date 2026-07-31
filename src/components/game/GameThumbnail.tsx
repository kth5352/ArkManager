import { useState } from 'react'
import { buildThumbnailUrl } from '../../services/thumbnailService'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface GameThumbnailProps {
  entry: Pick<ScannedEntry, 'path' | 'kind'>
}

// Renders nothing (letting the parent's own bg-muted placeholder show
// through) for files, and for folders where the thumb:// request 404s (no
// cover-like image found - see findThumbnailPath). Tracks the failure by
// path rather than a plain boolean so a react-window row/cell recycled for
// a different entry doesn't keep showing a stale failure from whatever
// entry it last rendered.
export function GameThumbnail({ entry }: GameThumbnailProps) {
  const [failedPath, setFailedPath] = useState<string | null>(null)

  if (entry.kind !== 'folder' || failedPath === entry.path) return null

  return (
    <img
      src={buildThumbnailUrl(entry.path)}
      alt=""
      className="h-full w-full object-cover"
      draggable={false}
      onError={() => setFailedPath(entry.path)}
    />
  )
}
