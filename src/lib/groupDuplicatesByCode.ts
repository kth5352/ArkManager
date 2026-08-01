export interface CodedEntry {
  code: { value: string } | null
}

// Groups entries sharing the same identification code (e.g. the same DLsite
// game kept as both a .zip archive and an already-extracted folder, or
// several versioned copies) - only codes with 2+ entries are included, so a
// simple `groups.get(entry.code.value)` check tells a caller whether a
// given entry has any duplicates at all.
export function groupDuplicatesByCode<T extends CodedEntry>(entries: T[]): Map<string, T[]> {
  const byCode = new Map<string, T[]>()

  for (const entry of entries) {
    if (!entry.code) continue
    const list = byCode.get(entry.code.value)
    if (list) list.push(entry)
    else byCode.set(entry.code.value, [entry])
  }

  for (const [code, list] of byCode) {
    if (list.length < 2) byCode.delete(code)
  }

  return byCode
}
