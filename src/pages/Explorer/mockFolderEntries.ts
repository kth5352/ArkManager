export interface MockFolderEntry {
  id: string
  name: string
  kind: 'folder' | 'file' | 'game'
  rjCode?: string
  title?: string
}

export function generateMockFolderEntries(path: string): MockFolderEntry[] {
  return [
    { id: `${path}/하위폴더1`, name: '하위폴더1', kind: 'folder' },
    {
      id: `${path}/RJ01111.zip`,
      name: 'RJ01111.zip',
      kind: 'game',
      rjCode: 'RJ01111',
      title: '샘플 게임 1',
    },
    {
      id: `${path}/RJ02222`,
      name: 'RJ02222',
      kind: 'game',
      rjCode: 'RJ02222',
      title: '샘플 게임 2 (압축해제됨)',
    },
    { id: `${path}/memo.txt`, name: 'memo.txt', kind: 'file' },
  ]
}
