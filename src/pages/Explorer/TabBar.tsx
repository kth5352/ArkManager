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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../components/ui/context-menu'
import { useExplorerStore, type ExplorerTab } from '../../stores/explorerStore'

function SortableTab({ tab }: { tab: ExplorerTab }) {
  const activeTabId = useExplorerStore((s) => s.activeTabId)
  const setActiveTab = useExplorerStore((s) => s.setActiveTab)
  const closeTab = useExplorerStore((s) => s.closeTab)
  const closeOtherTabs = useExplorerStore((s) => s.closeOtherTabs)
  const duplicateTab = useExplorerStore((s) => s.duplicateTab)

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: tab.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={() => setActiveTab(tab.id)}
          className={`flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors ${
            tab.id === activeTabId
              ? 'border-primary bg-card font-medium'
              : 'border-transparent hover:bg-accent'
          }`}
        >
          {tab.label}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => closeTab(tab.id)}>탭 닫기</ContextMenuItem>
        <ContextMenuItem onSelect={() => closeOtherTabs(tab.id)}>다른 탭 모두 닫기</ContextMenuItem>
        <ContextMenuItem onSelect={() => duplicateTab(tab.id)}>탭 복제</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('refresh folder', tab.path)}>
          이 폴더 새로고침
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('reveal in OS explorer', tab.path)}>
          탐색기(OS)에서 폴더 열기
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function TabBar() {
  const tabs = useExplorerStore((s) => s.tabs)
  const reorderTabs = useExplorerStore((s) => s.reorderTabs)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderTabs(String(active.id), String(over.id))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <SortableTab key={tab.id} tab={tab} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
