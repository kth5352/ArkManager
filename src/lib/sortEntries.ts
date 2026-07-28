export interface Sortable {
  name: string
  mtimeMs: number
}

export function sortEntries<T extends Sortable>(
  entries: T[],
  field: 'name' | 'mtime',
  direction: 'asc' | 'desc'
): T[] {
  const sorted = [...entries].sort((a, b) => {
    const comparison = field === 'name' ? a.name.localeCompare(b.name) : a.mtimeMs - b.mtimeMs
    return direction === 'asc' ? comparison : -comparison
  })
  return sorted
}
