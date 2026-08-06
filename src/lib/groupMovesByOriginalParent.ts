export interface MovedPathPair {
  path: string
  newPath: string
}

export interface GroupedUndoMove {
  destDir: string
  paths: string[]
}

// Mirrors breadcrumb.ts's own drive-root handling (a bare "C:" is not the
// same location as its root "C:\\" to Windows filesystem APIs) - both
// normalize to forward slashes first so a mix of \ and / in the input never
// silently breaks the split. Exported so ExplorerPage.tsx's handleDragEnd
// can filter dragged paths by their own real current parent (see that
// file's 'entry' drag-end branch).
export function getParentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')

  // A UNC path's \\server\share prefix is one atomic unit, not an ordinary
  // "drop the last segment" segment like the rest of the path. The plain
  // split/filter/pop logic below normalizes \\server\share\folder\file.zip
  // to //server/share/folder/file.zip, and filter(Boolean) silently drops
  // the two empty leading components produced by the leading "//" - losing
  // the \\server\share prefix entirely instead of just popping the last
  // segment. Handle UNC paths separately so the prefix always survives.
  if (normalized.startsWith('//')) {
    const uncParts = normalized.slice(2).split('/').filter(Boolean)
    const uncPrefix = `\\\\${uncParts[0]}\\${uncParts[1]}`
    const rest = uncParts.slice(2)
    if (rest.length <= 1) return `${uncPrefix}\\`
    rest.pop()
    return `${uncPrefix}\\${rest.join('\\')}`
  }

  const parts = normalized.split('/').filter(Boolean)
  parts.pop()
  if (parts.length === 1 && /^[A-Za-z]:$/.test(parts[0])) return `${parts[0]}\\`
  return parts.join('\\')
}

// Groups moved items by the parent directory they originally came from, so
// undo can move each group back to its own original location - usually a
// single group (drag-and-drop, and most dialog moves, all originate from
// one currently-open folder), occasionally more than one (a batch move
// built from recursive search results, where selected items can span
// different subfolders). Each group's `paths` are the items' CURRENT
// (post-move) locations - what undo actually needs to move, back to
// `destDir`, their shared original parent.
export function groupMovesByOriginalParent(moves: MovedPathPair[]): GroupedUndoMove[] {
  const byParent = new Map<string, string[]>()

  for (const move of moves) {
    const parent = getParentPath(move.path)
    const list = byParent.get(parent)
    if (list) list.push(move.newPath)
    else byParent.set(parent, [move.newPath])
  }

  return Array.from(byParent, ([destDir, paths]) => ({ destDir, paths }))
}
