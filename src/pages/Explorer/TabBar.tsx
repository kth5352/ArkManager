import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { FolderOpen, Plus, X } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../components/ui/context-menu'
import { useExplorerStore, type ExplorerTab } from '../../stores/explorerStore'
import { useLibraries } from '../../services/librariesService'
import { deriveNameFromPath } from '../../lib/deriveNameFromPath'
import { useShowItemInFolder } from '../../services/shellService'
import { useTranslation } from '../../i18n/useTranslation'

function SortableTab({ tab }: { tab: ExplorerTab }) {
  const { t } = useTranslation()
  const activeTabId = useExplorerStore((s) => s.activeTabId)
  const setActiveTab = useExplorerStore((s) => s.setActiveTab)
  const closeTab = useExplorerStore((s) => s.closeTab)
  const closeOtherTabs = useExplorerStore((s) => s.closeOtherTabs)
  const duplicateTab = useExplorerStore((s) => s.duplicateTab)
  const showItemInFolder = useShowItemInFolder()
  const queryClient = useQueryClient()

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: tab.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={() => setActiveTab(tab.id)}
          onAuxClick={(e) => {
            if (e.button === 1) closeTab(tab.id) // 마우스 휠클릭(가운데 버튼)으로 탭 닫기
          }}
          className={`group flex shrink-0 items-center gap-1 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors ${
            tab.id === activeTabId
              ? 'border-primary bg-card font-medium'
              : 'border-transparent hover:bg-accent'
          }`}
        >
          <span>{tab.label}</span>
          <button
            aria-label={t('tabBar.closeTab')}
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
            className="rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => closeTab(tab.id)}>{t('tabBar.closeTab')}</ContextMenuItem>
        <ContextMenuItem onSelect={() => closeOtherTabs(tab.id)}>
          {t('tabBar.closeOtherTabs')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => duplicateTab(tab.id)}>
          {t('tabBar.duplicateTab')}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            queryClient.invalidateQueries({ queryKey: ['folder-scan', tab.path] })
            queryClient.invalidateQueries({ queryKey: ['folder-scan-recursive', tab.path] })
          }}
        >
          {t('tabBar.refreshFolder')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => showItemInFolder.mutate(tab.path)}>
          {t('tabBar.openInOsExplorer')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function TabBar() {
  const { t } = useTranslation()
  const tabs = useExplorerStore((s) => s.tabs)
  const activeTabId = useExplorerStore((s) => s.activeTabId)
  const reorderTabs = useExplorerStore((s) => s.reorderTabs)
  const addTab = useExplorerStore((s) => s.addTab)
  const closeTab = useExplorerStore((s) => s.closeTab)
  const { data: libraries } = useLibraries()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key === 'w') {
        // Ctrl+W is global (window-level) so it can fire while an input,
        // textarea, or contentEditable elsewhere in the app (e.g. the
        // RatingMemoDialog memo field) is focused - don't destroy in-progress
        // typing by unmounting the active tab out from under it.
        const active = document.activeElement
        const isEditingElsewhere =
          active instanceof HTMLElement &&
          (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
        if (isEditingElsewhere) return

        event.preventDefault()
        const activeTabId = useExplorerStore.getState().activeTabId
        if (activeTabId) closeTab(activeTabId)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeTab])

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderTabs(String(active.id), String(over.id))
  }

  const hasLibraries = (libraries?.length ?? 0) > 0

  const handleAddTab = (): void => {
    // Only reachable when a library is registered (button is disabled
    // otherwise) - without this guard a new tab would get path: '', and
    // FolderView's isError branch would show a generic "cannot access this
    // folder" message that's misleading for "no library registered yet".
    if (!hasLibraries) return
    // Inherit the currently active tab's path (like a real browser's "new
    // tab" staying in context) rather than always jumping back to whichever
    // library happens to be first in the registration list - only falls
    // back to that when there's no active tab yet (e.g. the very first tab).
    const activeTab = tabs.find((tab) => tab.id === activeTabId)
    addTab({ label: t('tabBar.newTab'), path: activeTab?.path ?? libraries?.[0]?.path ?? '' })
  }

  const handleOpenFolder = async (): Promise<void> => {
    const path = await window.api.libraries.pickFolder()
    if (!path) return
    addTab({ label: deriveNameFromPath(path), path })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex items-center border-b border-border">
          {tabs.map((tab) => (
            <SortableTab key={tab.id} tab={tab} />
          ))}
          <button
            onClick={handleAddTab}
            disabled={!hasLibraries}
            aria-label={t('tabBar.addTab')}
            title={hasLibraries ? t('tabBar.addTab') : t('tabBar.registerLibraryFirst')}
            className="flex shrink-0 items-center justify-center rounded-t-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={handleOpenFolder}
            aria-label={t('tabBar.openFolder')}
            title={t('tabBar.openFolder')}
            className="flex shrink-0 items-center justify-center rounded-t-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
      </SortableContext>
    </DndContext>
  )
}
