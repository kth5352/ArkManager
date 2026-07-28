import { useState } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../components/ui/context-menu'
import { pathToBreadcrumbSegments } from './breadcrumb'
import { useExplorerStore } from '../../stores/explorerStore'
import { useThumbnail } from '../../services/thumbnailService'
import { useFolderScan } from '../../services/scannerService'
import { DetailOverlay } from './DetailOverlay'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface FolderViewProps {
  tabId: string
  path: string
  onNavigate: (path: string) => void
}

function FolderEntryContextMenu({
  entry,
  onOpenInNewTab,
}: {
  entry: ScannedEntry
  onOpenInNewTab: (entry: ScannedEntry) => void
}) {
  if (entry.code) {
    return (
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => console.log('launch', entry.path)}>실행</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('open dlsite page', entry.code?.value)}>
          DLsite 페이지 열기
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('open folder', entry.path)}>
          폴더 열기
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => navigator.clipboard.writeText(entry.code?.value ?? '')}>
          RJ번호 복사
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => navigator.clipboard.writeText(entry.name)}>
          제목 복사
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('edit custom title', entry.path)}>
          사용자 지정 제목 편집
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('refresh metadata', entry.code?.value)}>
          메타데이터 새로고침
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('redownload cover', entry.code?.value)}>
          커버 이미지 재다운로드
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('extract archive', entry.path)}>
          압축 해제
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('toggle favorite', entry.path)}>
          즐겨찾기 설정
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('edit memo', entry.path)}>
          메모 설정
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('set rating', entry.path)}>
          평점 설정
        </ContextMenuItem>
      </ContextMenuContent>
    )
  }

  if (entry.kind === 'folder') {
    return (
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onOpenInNewTab(entry)}>새 탭으로 열기</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('reveal in OS explorer', entry.path)}>
          탐색기(OS)에서 열기
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('pin favorite', entry.path)}>
          즐겨찾기로 고정
        </ContextMenuItem>
      </ContextMenuContent>
    )
  }

  return null
}

function FolderEntryRow({
  entry,
  onOpenInNewTab,
  onEntryClick,
}: {
  entry: ScannedEntry
  onOpenInNewTab: (entry: ScannedEntry) => void
  onEntryClick: (entry: ScannedEntry) => void
}) {
  const { data: thumbnail } = useThumbnail(entry.path, entry.kind)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent"
          onClick={() => onEntryClick(entry)}
        >
          {entry.code && (
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
              {thumbnail && (
                <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
              )}
            </div>
          )}
          <span className="truncate">{entry.name}</span>
        </li>
      </ContextMenuTrigger>
      <FolderEntryContextMenu entry={entry} onOpenInNewTab={onOpenInNewTab} />
    </ContextMenu>
  )
}

export function FolderView({ tabId, path, onNavigate }: FolderViewProps) {
  const [selectedGame, setSelectedGame] = useState<ScannedEntry | null>(null)
  const addTab = useExplorerStore((s) => s.addTab)
  const breadcrumbs = pathToBreadcrumbSegments(path)

  // useFolderScan's queryKey includes `path`, so React Query automatically
  // re-fetches when it changes - ExplorerPage keys FolderView only on the
  // active tab's id, not its path, so navigating into a subfolder (or via
  // breadcrumb) updates `path` without unmounting this component.
  const { data: entries = [] } = useFolderScan(path)

  const openInNewTab = (entry: ScannedEntry): void => {
    addTab({ label: entry.name, path: entry.path })
  }

  const handleEntryClick = (entry: ScannedEntry): void => {
    if (entry.code) {
      setSelectedGame(entry)
    } else if (entry.kind === 'folder') {
      onNavigate(entry.path)
    }
  }

  return (
    <div className="flex h-full flex-col" data-tab-id={tabId}>
      <div className="flex items-center gap-1 border-b border-border px-4 py-2 text-sm text-muted-foreground">
        {breadcrumbs.map((segment, index) => (
          <span key={segment.path} className="flex items-center gap-1">
            {index > 0 && <span>/</span>}
            <button
              className="hover:text-foreground hover:underline"
              onClick={() => onNavigate(segment.path)}
            >
              {segment.label}
            </button>
          </span>
        ))}
      </div>
      <ul className="flex-1 divide-y divide-border overflow-auto">
        {entries.map((entry) => (
          <FolderEntryRow
            key={entry.path}
            entry={entry}
            onOpenInNewTab={openInNewTab}
            onEntryClick={handleEntryClick}
          />
        ))}
      </ul>
      <DetailOverlay game={selectedGame} onClose={() => setSelectedGame(null)} />
    </div>
  )
}
