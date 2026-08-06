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
// silently breaks the split.
function getParentPath(path: string): string {
  const parts = path
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
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
