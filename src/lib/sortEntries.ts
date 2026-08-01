export interface Sortable {
  name: string
  mtimeMs: number
}

// A folder has no extension - '' sorts before every real extension, so
// folders naturally group together at one end regardless of direction.
function getExtension(name: string): string {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex === -1) return ''
  return name.slice(dotIndex + 1).toLowerCase()
}

export function sortEntries<T extends Sortable>(
  entries: T[],
  field: 'name' | 'mtime' | 'extension',
  direction: 'asc' | 'desc'
): T[] {
  const sorted = [...entries].sort((a, b) => {
    let comparison: number
    if (field === 'name') {
      comparison = a.name.localeCompare(b.name)
    } else if (field === 'mtime') {
      comparison = a.mtimeMs - b.mtimeMs
    } else {
      // Ties within the same extension (including the folder group) fall
      // back to name order, per the explicit request that sub-ordering
      // within an extension group be alphabetical.
      const extensionComparison = getExtension(a.name).localeCompare(getExtension(b.name))
      comparison = extensionComparison !== 0 ? extensionComparison : a.name.localeCompare(b.name)
    }
    return direction === 'asc' ? comparison : -comparison
  })
  return sorted
}
