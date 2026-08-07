import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { useLibraries } from '../../services/librariesService'
import { useFolderScan } from '../../services/scannerService'
import {
  useExplorerTreeWidthQuery,
  useSetExplorerTreeWidthMutation,
} from '../../services/settingsService'
import { clampExplorerTreeWidth, EXPLORER_TREE_WIDTH_DEFAULT } from '../../lib/clampExplorerTreeWidth'
import { useTranslation } from '../../i18n/useTranslation'
import { pathToBreadcrumbSegments } from './breadcrumb'
import type { ExplorerDropData } from './dragTypes'

interface ExplorerSidebarProps {
  onNavigate: (path: string) => void
  onClose: () => void
  activePath?: string
}

// Set membership is normalized (lowercase, forward-slash) rather than exact
// string match - the same path can reach this set two different ways (a
// real ScannedEntry.path from a scan, or a reconstructed path from
// pathToBreadcrumbSegments in the auto-expand effect below), and those two
// sources aren't guaranteed to agree on casing/separator for the same real
// folder. Matches the normalization findLibraryForPath.ts and
// ExplorerPage.tsx's handleDragEnd already use for the identical reason.
function normalizePath(path: string): string {
  return path.toLowerCase().replace(/\\/g, '/')
}

// The sidebar's single root is whichever drive the active tab's path is
// currently on - not a fixed list of registered libraries (registered
// libraries just appear as ordinary folders within that drive's tree, no
// special treatment). pathToBreadcrumbSegments already special-cases a bare
// drive letter as its own root segment ("C:" -> "C:\\"), so the first
// segment of any real path IS that path's drive root.
function getDriveRoot(path: string): string | null {
  return pathToBreadcrumbSegments(path)[0]?.path ?? null
}

interface TreeNodeProps {
  path: string
  label: string
  depth: number
  onNavigate: (path: string) => void
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  activePath?: string
}

function TreeNode({
  path,
  label,
  depth,
  onNavigate,
  expandedPaths,
  onToggleExpand,
  activePath,
}: TreeNodeProps) {
  const { t } = useTranslation()
  const isExpanded = expandedPaths.has(normalizePath(path))
  const isActive = activePath !== undefined && normalizePath(path) === normalizePath(activePath)
  const { data: entries = [], isError } = useFolderScan(path, { enabled: isExpanded })
  const folders = entries.filter((entry) => entry.kind === 'folder')
  const { setNodeRef, isOver } = useDroppable({
    id: path,
    data: { type: 'folder-entry', path } satisfies ExplorerDropData,
  })

  return (
    <div>
      <div
        ref={setNodeRef}
        style={{ paddingLeft: depth * 16 }}
        className={`flex h-8 items-center gap-1 rounded px-1 text-sm hover:bg-accent ${
          isActive ? 'bg-accent font-medium' : ''
        } ${isOver ? 'bg-accent ring-1 ring-inset ring-primary' : ''}`}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggleExpand(path)
          }}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <button type="button" onClick={() => onNavigate(path)} className="truncate text-left">
          {label}
        </button>
      </div>
      {isExpanded && (
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
                activePath={activePath}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function ExplorerSidebar({ onNavigate, onClose, activePath }: ExplorerSidebarProps) {
  const { t } = useTranslation()
  const { data: libraries = [] } = useLibraries()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  // Always starts undefined, deliberately NOT useState(activePath) - a fresh
  // mount can already have a real, non-empty activePath (e.g. toggling the
  // sidebar off/on remounts it entirely via ExplorerPage's `{sidebarOpen &&
  // ...}`, or a restart hydrates a persisted tab on a nested path), and
  // seeding this from activePath itself would make `activePath !==
  // syncedActivePath` false on that very first render - skipping the
  // auto-expand the sync block below exists to run. Starting undefined
  // guarantees a mismatch (and therefore one sync pass) on mount whenever
  // activePath is already set, matching what the useEffect this replaced
  // would have done (effects always run once after the initial commit,
  // regardless of the dependency's starting value).
  const [syncedActivePath, setSyncedActivePath] = useState<string | undefined>(undefined)
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

  // Falls back to the first registered library's own drive only when no tab
  // is open at all, so the sidebar still has something to show/click before
  // a first tab exists (matches TabBar.tsx's own handleAddTab fallback
  // logic). null (neither a tab nor a library) means nothing to root on.
  const rootSourcePath = activePath ?? libraries[0]?.path
  const rootPath = rootSourcePath ? getDriveRoot(rootSourcePath) : null

  // Reveals activePath in the tree whenever the active tab's path changes
  // (tab switch, breadcrumb click, drilling into a subfolder) - expands the
  // root itself plus every ancestor folder between it and activePath,
  // inclusive of activePath itself (so its own children are fetched too,
  // matching normal file-tree "navigate into" behavior). Render-time sync,
  // not a useEffect - same pattern as the persistedWidth sync above (and
  // DetailSidebar.tsx's own persisted-width sync), so the highlight/expand
  // doesn't visibly snap one frame late after activePath changes, and so
  // this doesn't trip the set-state-in-effect lint rule the way a plain
  // useEffect calling setExpandedPaths would.
  if (activePath !== syncedActivePath) {
    setSyncedActivePath(activePath)
    if (activePath) {
      const ancestorPaths = pathToBreadcrumbSegments(activePath).map((segment) => segment.path)
      setExpandedPaths((prev) => {
        const next = new Set(prev)
        for (const ancestorPath of ancestorPaths) next.add(normalizePath(ancestorPath))
        return next
      })
    }
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
      <div className="flex items-center justify-end border-b border-border p-1">
        <button
          type="button"
          aria-label={t('explorer.closeSidebar')}
          title={t('explorer.closeSidebar')}
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        {rootPath === null ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">{t('explorer.sidebarEmpty')}</p>
        ) : (
          <TreeNode
            path={rootPath}
            label={rootPath}
            depth={0}
            onNavigate={onNavigate}
            expandedPaths={expandedPaths}
            onToggleExpand={toggleExpand}
            activePath={activePath}
          />
        )}
      </div>
    </div>
  )
}
