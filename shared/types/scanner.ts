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
  code: GameCode | null
}
