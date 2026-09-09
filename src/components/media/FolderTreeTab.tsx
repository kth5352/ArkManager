import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useFolderScanRecursive } from '../../services/scannerService'
import { useMediaFolderQuery } from '../../services/settingsService'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useTranslation } from '../../i18n/useTranslation'
import { Skeleton } from '../ui/skeleton'
import { buildFolderTree, getFolderAncestorPaths, type FolderTreeNode } from '../../lib/buildFolderTree'

// Set membership is normalized (lowercase, forward-slash) rather than exact
// string match, same reasoning as ExplorerSidebar.tsx's own normalizePath -
// a node's path here can be either a real ScannedEntry.path from the scan or
// a path reconstructed segment-by-segment by buildFolderTree/
// getFolderAncestorPaths, and those two sources aren't guaranteed to agree
// on casing/separator for the same real folder.
function normalizePath(path: string): string {
  return path.toLowerCase().replace(/\\/g, '/')
}

interface TreeNodeRowProps {
  node: FolderTreeNode
  depth: number
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onNavigate: (path: string) => void
  activePath: string
}

// Mirrors ExplorerSidebar.tsx's TreeNode: same expand/collapse chevron +
// active-path highlight markup and depth-based indent. Deliberately
// different in two ways: no dnd-kit useDroppable wiring (this tree has no
// file-move functionality, it's click-to-navigate only), and no per-node
// useFolderScan call - the whole subtree already arrived in one
// useFolderScanRecursive call in the parent, so a node's children are known
// up front rather than lazily fetched on first expand. That also means a
// leaf node (no children) doesn't get a toggle button at all, unlike
// ExplorerSidebar's version (which always shows one, since it can't know a
// node is childless without fetching it first).
function TreeNodeRow({
  node,
  depth,
  expandedPaths,
  onToggleExpand,
  onNavigate,
  activePath,
}: TreeNodeRowProps) {
  const { t } = useTranslation()
  const hasChildren = node.children.length > 0
  const isExpanded = expandedPaths.has(normalizePath(node.path))
  const isActive = normalizePath(node.path) === normalizePath(activePath)

  return (
    <div>
      <div
        style={{ paddingLeft: depth * 16 }}
        className={`flex h-8 min-w-0 items-center gap-1 rounded px-1 text-sm transition-colors hover:bg-accent ${
          isActive ? 'bg-accent font-medium' : ''
        }`}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={t('explorer.toggleFolderExpand')}
            onClick={(event) => {
              event.stopPropagation()
              onToggleExpand(node.path)
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        {/* min-w-0 flex-1: a flex item's default min-width is auto (its own
            content width), which refuses to shrink below that regardless of
            `truncate` - the row's own min-w-0 doesn't cascade to children.
            Without this, a long folder name (Pretendard renders Korean/
            Japanese wider than the previous system font) overflows the
            320px sidebar's right edge unclipped instead of ellipsizing. */}
        <button
          type="button"
          onClick={() => onNavigate(node.path)}
          className="min-w-0 flex-1 truncate text-left"
          title={node.name}
        >
          {node.name}
        </button>
      </div>
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onNavigate={onNavigate}
              activePath={activePath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// MediaSidebar's 4th tab - a clickable folder tree for the anchor root
// folder MediaPage.tsx's folder picker persists (useMediaFolderQuery), kept
// in sync with the same mediaBrowsePath/navigateMediaBrowseTo state
// MediaPage's breadcrumb reads/writes (see mediaPlayerStore.ts's own
// comment on why that state lives in the store rather than either
// component). Unlike MediaPage's shallow per-level scan, this needs the
// whole subtree up front to draw a tree rather than one level at a time, so
// it uses useFolderScanRecursive instead of useFolderScan.
export function FolderTreeTab() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: rootPath = null } = useMediaFolderQuery()
  const mediaBrowsePath = useMediaPlayerStore((s) => s.mediaBrowsePath)
  const navigateMediaBrowseTo = useMediaPlayerStore((s) => s.navigateMediaBrowseTo)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  // Same "always starts undefined/null, deliberately not seeded from the
  // live value" reasoning as ExplorerSidebar.tsx's own syncedActivePath -
  // guarantees one sync pass on mount whenever mediaBrowsePath/rootPath is
  // already set (e.g. this tab opened after MediaPage already picked a
  // root), rather than only reacting to later changes.
  const [syncedActivePath, setSyncedActivePath] = useState<string | null>(null)

  const {
    data: entries,
    isLoading,
    isError,
  } = useFolderScanRecursive(rootPath ?? '', { enabled: rootPath !== null })

  // Falls back to rootPath itself when mediaBrowsePath hasn't been set yet
  // (this tab can mount before MediaPage.tsx ever has - see
  // mediaPlayerStore.ts's comment on the two living in different parts of
  // the tree) - same fallback MediaPage.tsx's own `currentPath` expression
  // uses, for the same reason.
  const activePath = mediaBrowsePath ?? rootPath ?? ''

  // Render-time sync, not a useEffect - mirrors ExplorerSidebar.tsx's own
  // activePath auto-expand sync, so navigating via MediaPage's breadcrumb
  // (or a folder row there) reveals/highlights the matching node here
  // without a one-frame-late snap.
  if (activePath !== syncedActivePath) {
    setSyncedActivePath(activePath)
    if (rootPath && activePath) {
      const ancestorPaths = getFolderAncestorPaths(rootPath, activePath)
      setExpandedPaths((prev) => {
        let changed = false
        const next = new Set(prev)
        for (const ancestorPath of ancestorPaths) {
          const normalized = normalizePath(ancestorPath)
          if (!next.has(normalized)) {
            next.add(normalized)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }
  }

  // This tab (MediaSidebar's 4th tab, mounted via AppLayout) can be visible
  // from any page, not just /media - navigateMediaBrowseTo alone only
  // updates shared store state, which has no visible effect unless
  // MediaPage (the state's other consumer) happens to be mounted. Without
  // this, clicking a node elsewhere silently updated state the user
  // couldn't see.
  const handleNavigate = (path: string): void => {
    navigateMediaBrowseTo(path)
    navigate({ to: '/media' })
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

  const tree = rootPath
    ? buildFolderTree(
        rootPath,
        (entries ?? []).filter((entry) => entry.kind === 'folder').map((entry) => entry.path)
      )
    : null

  return (
    <div className="flex flex-col gap-0.5">
      {rootPath === null ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">{t('media.pickFolderPrompt')}</p>
      ) : isError ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">{t('explorer.cannotAccessFolder')}</p>
      ) : isLoading || tree === null ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <TreeNodeRow
          node={tree}
          depth={0}
          expandedPaths={expandedPaths}
          onToggleExpand={toggleExpand}
          onNavigate={handleNavigate}
          activePath={activePath}
        />
      )}
    </div>
  )
}
