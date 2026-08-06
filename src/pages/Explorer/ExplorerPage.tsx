import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { TabBar } from './TabBar'
import { FolderView } from './FolderView'
import { useExplorerStore } from '../../stores/explorerStore'
import { useSelectionStore } from '../../stores/selectionStore'
import { useMoveEntries } from '../../services/fileOpsService'
import { useLibraries } from '../../services/librariesService'
import { findLibraryForPath } from '../../lib/findLibraryForPath'
import { getParentPath } from '../../lib/groupMovesByOriginalParent'
import { useExplorerTabsPersistence } from '../../hooks/useExplorerTabsPersistence'
import { useTranslation } from '../../i18n/useTranslation'
import type { ExplorerDragData, ExplorerDropData } from './dragTypes'

interface ActiveDrag {
  data: ExplorerDragData
  count: number
}

export function ExplorerPage() {
  const { t } = useTranslation()
  useExplorerTabsPersistence()
  const activeTab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const navigateTab = useExplorerStore((s) => s.navigateTab)
  const reorderTabs = useExplorerStore((s) => s.reorderTabs)
  const moveEntries = useMoveEntries()
  const { data: libraries } = useLibraries()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)

  const handleDragStart = (event: DragStartEvent): void => {
    const data = event.active.data.current as ExplorerDragData | undefined
    if (!data) return
    const selectedPaths = useSelectionStore.getState().selectedPaths
    const count =
      data.type === 'entry' && selectedPaths.has(data.entry.path) ? selectedPaths.size : 1
    setActiveDrag({ data, count })
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveDrag(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeData = active.data.current as ExplorerDragData | undefined

    if (activeData?.type === 'tab') {
      reorderTabs(String(active.id), String(over.id))
      return
    }

    if (activeData?.type === 'entry') {
      const overData = over.data.current as ExplorerDropData | undefined
      if (!overData) return
      const destDir = overData.path
      // Hard safety net: never move to a destination outside every
      // registered library. The backend intentionally leaves destDir
      // unrestricted (see explorerHandlers.ts's own comment) because the
      // existing native-folder-picker Move dialog legitimately supports
      // moving to arbitrary non-library locations (e.g. a backup drive) -
      // but that's a deliberate multi-step flow, unlike a single easily
      // mis-clicked drag-and-drop gesture whose undo also can't reach
      // outside a library. This check applies regardless of how the drop
      // target's own droppable/disabled state was computed, so it still
      // catches any future drop-target type that doesn't yet gate itself.
      if (!findLibraryForPath(destDir, libraries ?? [])) return

      const selectedPaths = useSelectionStore.getState().selectedPaths
      const draggedPaths = selectedPaths.has(activeData.entry.path)
        ? Array.from(selectedPaths)
        : [activeData.entry.path]
      // Per-item, not "destDir === activeTab?.path": in search mode a
      // dragged entry's own parent can differ from the tab's own path (it's
      // a recursive-search result from a subfolder), so that blanket check
      // silently discarded legitimate "move it up here" drops with no
      // feedback at all. Filtering by each item's real current parent
      // subsumes the old check's correct behavior for normal-mode rows too
      // (whose parent always equals activeTab.path anyway). Normalized the
      // same way findLibraryForPath just normalized destDir above - a
      // draggable's own path always comes from the scanner (native
      // backslashes), but destDir can come from a tab's path, which isn't
      // guaranteed to use the same separator/casing (e.g. a persisted tab
      // path with forward slashes) - an un-normalized comparison here could
      // then treat "drop it back into its own folder" as a real move.
      const normalizePath = (p: string): string => p.toLowerCase().replace(/\\/g, '/')
      const pathsToMove = draggedPaths.filter(
        (p) => normalizePath(getParentPath(p)) !== normalizePath(destDir)
      )
      if (pathsToMove.length === 0) return
      // Dragging a multi-selection that happens to include the drop target
      // itself (e.g. selecting two folders and dropping one onto the
      // other) - the active.id === over.id guard above only catches the
      // exact dragged row, not other selected items. Normalized for the
      // same reason as the filter above.
      if (pathsToMove.some((p) => normalizePath(p) === normalizePath(destDir))) return

      moveEntries.mutate(
        { paths: pathsToMove, destDir },
        // Matches every other batch action (SelectionToolbar.tsx's
        // closeDialog after rename/move/delete) - without this the
        // toolbar keeps reporting the old selection count after a
        // drag-drop move, even though the moved paths no longer exist at
        // their old location. Safe as a plain call-site callback since
        // ExplorerPage doesn't unmount as a result of this mutation.
        { onSuccess: () => useSelectionStore.getState().deactivate() }
      )
    }
  }

  return (
    <DndContext
      sensors={sensors}
      // Not closestCenter/closestCorners - both would resolve a drop to the
      // nearest droppable even when the pointer isn't over it, silently
      // relocating a file dropped on a disabled (file-kind) row into
      // whichever folder row happens to be geometrically nearest. Only
      // pointerWithin requires the pointer to actually be inside the target
      // droppable's rect, which is the right semantic for a destructive
      // move - don't swap this back for tab-reorder's sake, TabBar's own
      // SortableContext still reorders correctly under it.
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className="flex h-full flex-col">
        <TabBar />
        {activeTab ? (
          <FolderView
            key={activeTab.id}
            tabId={activeTab.id}
            path={activeTab.path}
            onNavigate={(path) => navigateTab(activeTab.id, path)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t('explorer.noOpenTabs')}
          </div>
        )}
      </div>
      <DragOverlay>
        {activeDrag?.data.type === 'entry' && (
          <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-lg">
            {activeDrag.count > 1
              ? t('explorer.dragCount', { count: activeDrag.count })
              : activeDrag.data.entry.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
