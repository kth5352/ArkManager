import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
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
      // A no-op drop: the target is the folder this tab is already showing
      // (dropped onto its own breadcrumb tail, or the tab itself).
      if (destDir === activeTab?.path) return

      const selectedPaths = useSelectionStore.getState().selectedPaths
      const draggedPaths = selectedPaths.has(activeData.entry.path)
        ? Array.from(selectedPaths)
        : [activeData.entry.path]
      // Dragging a multi-selection that happens to include the drop target
      // itself (e.g. selecting two folders and dropping one onto the
      // other) - the active.id === over.id guard above only catches the
      // exact dragged row, not other selected items.
      if (draggedPaths.includes(destDir)) return

      moveEntries.mutate({ paths: draggedPaths, destDir })
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
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
