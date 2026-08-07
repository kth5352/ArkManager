import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { useLibraries } from '../../services/librariesService'
import { useFolderScan } from '../../services/scannerService'
import {
  useExplorerTreeWidthQuery,
  useSetExplorerTreeWidthMutation,
} from '../../services/settingsService'
import { clampExplorerTreeWidth, EXPLORER_TREE_WIDTH_DEFAULT } from '../../lib/clampExplorerTreeWidth'
import { useTranslation } from '../../i18n/useTranslation'
import type { ExplorerDropData } from './dragTypes'

interface ExplorerSidebarProps {
  onNavigate: (path: string) => void
}

// Set membership is normalized (lowercase, forward-slash) rather than exact
// string match - the same path can reach this set two different ways (a
// real ScannedEntry.path from a scan, or a reconstructed path from
// pathToBreadcrumbSegments in Task 3's auto-sync), and those two sources
// aren't guaranteed to agree on casing/separator for the same real folder.
// Matches the normalization findLibraryForPath.ts and ExplorerPage.tsx's
// handleDragEnd already use for the identical reason.
function normalizePath(path: string): string {
  return path.toLowerCase().replace(/\\/g, '/')
}

interface TreeNodeProps {
  path: string
  label: string
  depth: number
  disabled?: boolean
  onNavigate: (path: string) => void
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
}

function TreeNode({
  path,
  label,
  depth,
  disabled,
  onNavigate,
  expandedPaths,
  onToggleExpand,
}: TreeNodeProps) {
  const { t } = useTranslation()
  const isExpanded = expandedPaths.has(normalizePath(path))
  const { data: entries = [], isError } = useFolderScan(path, {
    enabled: isExpanded && !disabled,
  })
  const folders = entries.filter((entry) => entry.kind === 'folder')
  const { setNodeRef, isOver } = useDroppable({
    id: path,
    disabled,
    data: { type: 'folder-entry', path } satisfies ExplorerDropData,
  })

  return (
    <div>
      <div
        ref={setNodeRef}
        style={{ paddingLeft: depth * 16 }}
        className={`flex h-8 items-center gap-1 rounded px-1 text-sm ${
          disabled ? 'text-muted-foreground/50' : 'hover:bg-accent'
        } ${isOver ? 'bg-accent ring-1 ring-inset ring-primary' : ''}`}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation()
            onToggleExpand(path)
          }}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-0"
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onNavigate(path)}
          className="truncate text-left disabled:cursor-default"
        >
          {label}
        </button>
      </div>
      {isExpanded && !disabled && (
        <div>
          {isError ? (
            <p
              style={{ paddingLeft: (depth + 1) * 16 + 4 }}
              className="truncate text-xs text-muted-foreground"
            >
              {t('explorer.cannotAccessFolder')}
            </p>
          ) : (
            folders.map((entry) => (
              <TreeNode
                key={entry.path}
                path={entry.path}
                label={entry.name}
                depth={depth + 1}
                onNavigate={onNavigate}
                expandedPaths={expandedPaths}
                onToggleExpand={onToggleExpand}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function ExplorerSidebar({ onNavigate }: ExplorerSidebarProps) {
  const { t } = useTranslation()
  const { data: libraries = [] } = useLibraries()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const { data: persistedWidth } = useExplorerTreeWidthQuery()
  const setWidthMutation = useSetExplorerTreeWidthMutation()
  const [width, setWidth] = useState(persistedWidth ?? EXPLORER_TREE_WIDTH_DEFAULT)
  const [syncedWidth, setSyncedWidth] = useState(persistedWidth)

  // Render-time sync, not a useEffect - same pattern DetailSidebar.tsx uses
  // for its own persisted-width sync, so the width doesn't visibly snap
  // one frame late after the query resolves.
  if (persistedWidth !== syncedWidth) {
    setSyncedWidth(persistedWidth)
    if (persistedWidth !== undefined) setWidth(persistedWidth)
  }

  const toggleExpand = (path: string): void => {
    const normalized = normalizePath(path)
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(normalized)) next.delete(normalized)
      else next.add(normalized)
      return next
    })
  }

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = width
    let latestWidth = startWidth

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      // Sidebar sits on the LEFT edge of the content area (opposite
      // DetailSidebar, which sits on the right) - dragging right (positive
      // delta) should widen it, the opposite sign from DetailSidebar's own
      // startX - moveEvent.clientX.
      latestWidth = clampExplorerTreeWidth(startWidth + (moveEvent.clientX - startX))
      setWidth(latestWidth)
    }
    const finishDrag = (): void => {
      target.removeEventListener('pointermove', handlePointerMove)
      target.removeEventListener('pointerup', finishDrag)
      target.removeEventListener('pointercancel', finishDrag)
      setWidthMutation.mutate(latestWidth)
    }

    target.addEventListener('pointermove', handlePointerMove)
    target.addEventListener('pointerup', finishDrag)
    target.addEventListener('pointercancel', finishDrag)
  }

  return (
    <div
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col overflow-y-auto border-r border-border bg-card"
    >
      <div
        onPointerDown={handleResizePointerDown}
        className="absolute right-0 top-0 z-20 h-full w-1 cursor-col-resize hover:bg-primary/40"
      />
      <div className="flex flex-col gap-0.5 p-2">
        {libraries.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {t('explorer.sidebarNoLibraries')}
          </p>
        )}
        {libraries.map((library) => (
          <TreeNode
            key={library.id}
            path={library.path}
            label={library.name}
            depth={0}
            disabled={!library.exists}
            onNavigate={onNavigate}
            expandedPaths={expandedPaths}
            onToggleExpand={toggleExpand}
          />
        ))}
      </div>
    </div>
  )
}
