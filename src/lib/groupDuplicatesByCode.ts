import { isArchiveFile } from '../../shared/isArchiveFile'

export interface CodedEntry {
  code: { value: string } | null
  kind: 'file' | 'folder'
  name: string
}

type DuplicateKind = 'folder' | 'archive' | 'file'

function duplicateKindOf(entry: Pick<CodedEntry, 'kind' | 'name'>): DuplicateKind {
  if (entry.kind === 'folder') return 'folder'
  return isArchiveFile(entry.name) ? 'archive' : 'file'
}

export function duplicateGroupKeyOf(entry: CodedEntry): string | null {
  if (!entry.code) return null
  return `${entry.code.value}:${entry.kind}:${duplicateKindOf(entry)}`
}

// Groups entries sharing the same identification code (e.g. the same DLsite
// game kept as both a .zip archive and an already-extracted folder, or
// several versioned copies) - only codes with 2+ entries are included, so a
// simple `groups.get(entry.code.value)` check tells a caller whether a
// given entry has any duplicates at all.
export function groupDuplicatesByCode<T extends CodedEntry>(entries: T[]): Map<string, T[]> {
  const byGroup = new Map<string, T[]>()

  for (const entry of entries) {
    const key = duplicateGroupKeyOf(entry)
    if (!key) continue
    const list = byGroup.get(key)
    if (list) list.push(entry)
    else byGroup.set(key, [entry])
  }

  for (const [key, list] of byGroup) {
    if (list.length < 2) byGroup.delete(key)
  }

  return byGroup
}

export function getDuplicateGroupForEntry<T extends CodedEntry>(
  entry: T,
  groups: Map<string, T[]>
): T[] | undefined {
  const key = duplicateGroupKeyOf(entry)
  return key ? groups.get(key) : undefined
}

export function hasDuplicateGroupForEntry<T extends CodedEntry>(
  entry: T,
  groups: Map<string, T[]>
): boolean {
  return getDuplicateGroupForEntry(entry, groups) !== undefined
}

export function getExtractedArchiveCodes<T extends CodedEntry>(entries: T[]): Set<string> {
  const archiveCodes = new Set<string>()
  const folderCodes = new Set<string>()

  for (const entry of entries) {
    if (!entry.code) continue
    if (entry.kind === 'folder') folderCodes.add(entry.code.value)
    else if (isArchiveFile(entry.name)) archiveCodes.add(entry.code.value)
  }

  return new Set([...archiveCodes].filter((code) => folderCodes.has(code)))
}

export function isArchiveExtracted<T extends CodedEntry>(
  entry: T,
  extractedArchiveCodes: Set<string>
): boolean {
  return entry.kind === 'file' && isArchiveFile(entry.name) && !!entry.code?.value
    ? extractedArchiveCodes.has(entry.code.value)
    : false
}
