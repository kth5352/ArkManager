import { TabBar } from './TabBar'
import { FolderView } from './FolderView'
import { useExplorerStore } from '../../stores/explorerStore'
import { useExplorerTabsPersistence } from '../../hooks/useExplorerTabsPersistence'

export function ExplorerPage() {
  useExplorerTabsPersistence()
  const activeTab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const navigateTab = useExplorerStore((s) => s.navigateTab)

  return (
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
          열려있는 탭이 없습니다.
        </div>
      )}
    </div>
  )
}
