export type GameCodeType = 'RJ' | 'VJ' | 'ST' | 'VN' | 'VR' | 'GC'

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
  // Only set when `code` is non-null. 'filename' = extractCode() matched the
  // name; 'override' = code came from a path_code_overrides entry (manually
  // linked via "코드 연동"). Lets the UI offer "연동 해제" only for the
  // latter - a filename-derived code has nothing to unlink.
  codeSource?: 'filename' | 'override'
}
