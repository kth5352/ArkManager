import { useState } from 'react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '../../components/ui/context-menu'
import { pathToBreadcrumbSegments } from './breadcrumb'
import { generateMockFolderEntries, type MockFolderEntry } from './mockFolderEntries'
import { useExplorerStore } from '../../stores/explorerStore'
import { DetailOverlay } from './DetailOverlay'

interface FolderViewProps {
  tabId: string
  path: string
  onNavigate: (path: string) => void
}

function FolderEntryContextMenu({
  entry,
  onOpenInNewTab,
}: {
  entry: MockFolderEntry
  onOpenInNewTab: (entry: MockFolderEntry) => void
}) {
  if (entry.kind === 'folder') {
    return (
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onOpenInNewTab(entry)}>새 탭으로 열기</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('reveal in OS explorer', entry.id)}>
          탐색기(OS)에서 열기
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('pin favorite', entry.id)}>즐겨찾기로 고정</ContextMenuItem>
      </ContextMenuContent>
    )
  }

  if (entry.kind === 'game') {
    return (
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => console.log('launch', entry.id)}>실행</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('open dlsite page', entry.rjCode)}>
          DLsite 페이지 열기
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('open folder', entry.id)}>폴더 열기</ContextMenuItem>
        <ContextMenuItem onSelect={() => navigator.clipboard.writeText(entry.rjCode ?? '')}>
          RJ번호 복사
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => navigator.clipboard.writeText(entry.title ?? '')}>
          제목 복사
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('edit custom title', entry.id)}>
          사용자 지정 제목 편집
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('refresh metadata', entry.rjCode)}>
          메타데이터 새로고침
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('redownload cover', entry.rjCode)}>
          커버 이미지 재다운로드
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('extract archive', entry.id)}>압축 해제</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('toggle favorite', entry.id)}>즐겨찾기 설정</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('edit memo', entry.id)}>메모 설정</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('set rating', entry.id)}>평점 설정</ContextMenuItem>
      </ContextMenuContent>
    )
  }

  return null
}

export function FolderView({ tabId, path, onNavigate }: FolderViewProps) {
  const [selectedGame, setSelectedGame] = useState<MockFolderEntry | null>(null)
  const addTab = useExplorerStore((s) => s.addTab)
  const entries = generateMockFolderEntries(path)
  const breadcrumbs = pathToBreadcrumbSegments(path)

  const openInNewTab = (entry: MockFolderEntry): void => {
    addTab({ label: entry.name, path: entry.id })
  }

  const handleEntryClick = (entry: MockFolderEntry): void => {
    if (entry.kind === 'folder') {
      onNavigate(entry.id)
    } else if (entry.kind === 'game') {
      setSelectedGame(entry)
    }
  }

  return (
    <div className="flex h-full flex-col" data-tab-id={tabId}>
      <div className="flex items-center gap-1 border-b border-border px-4 py-2 text-sm text-muted-foreground">
        {breadcrumbs.map((segment, index) => (
          <span key={segment.path} className="flex items-center gap-1">
            {index > 0 && <span>/</span>}
            <button className="hover:text-foreground hover:underline" onClick={() => onNavigate(segment.path)}>
              {segment.label}
            </button>
          </span>
        ))}
      </div>
      <ul className="flex-1 divide-y divide-border overflow-auto">
        {entries.map((entry) => (
          <ContextMenu key={entry.id}>
            <ContextMenuTrigger asChild>
              <li
                className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent"
                onClick={() => handleEntryClick(entry)}
              >
                {entry.kind === 'game' && <div className="h-8 w-8 shrink-0 rounded bg-muted" />}
                <span className="truncate">{entry.kind === 'game' ? entry.title : entry.name}</span>
              </li>
            </ContextMenuTrigger>
            <FolderEntryContextMenu entry={entry} onOpenInNewTab={openInNewTab} />
          </ContextMenu>
        ))}
      </ul>
      <DetailOverlay game={selectedGame} onClose={() => setSelectedGame(null)} />
    </div>
  )
}
