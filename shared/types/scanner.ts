export type GameCodeType = 'RJ' | 'VJ' | 'ST'

export interface GameCode {
  type: GameCodeType
  value: string // full matched code, prefix included and uppercased, e.g. "RJ01234567" or "ST4282500"
}

export interface ScannedEntry {
  name: string // file/folder name as-is, extension included, no reformatting
  path: string
  kind: 'folder' | 'file'
  mtimeMs: number
  size: number // bytes. for folders, the directory entry size itself (not content sum)
  code: GameCode | null
}

// scanLibraryRecursive's documented invariant is that every returned entry has
// a recognized code (non-matching entries are dropped, not returned with
// code: null) - this type makes that guarantee visible to Gallery/List
// consumers instead of forcing them to null-check a field that can't
// actually be null in that path.
export interface GameEntry extends ScannedEntry {
  code: GameCode
}
