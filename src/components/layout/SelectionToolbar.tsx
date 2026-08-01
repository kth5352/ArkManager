import { useState } from 'react'
import { Button } from '../ui/button'
import { RenameDialog } from '../game/RenameDialog'
import { DeleteConfirmDialog } from '../game/DeleteConfirmDialog'
import { useSelectionStore } from '../../stores/selectionStore'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface SelectionToolbarProps {
  // The current page's own filtered/sorted list - used to resolve selected
  // paths back into entries, and as the target set for "전체 선택".
  allEntries: ScannedEntry[]
}

// Renders nothing while selection is empty - Gallery/List/DetailList mount
// this unconditionally in their toolbar row, so it only ever takes up space
// once the user has actually checked something.
export function SelectionToolbar({ allEntries }: SelectionToolbarProps) {
  const selectedPaths = useSelectionStore((s) => s.selectedPaths)
  const selectAll = useSelectionStore((s) => s.selectAll)
  const clear = useSelectionStore((s) => s.clear)
  const [dialogMode, setDialogMode] = useState<'rename' | 'delete' | null>(null)

  if (selectedPaths.size === 0) return null

  const selectedEntries = allEntries.filter((e) => selectedPaths.has(e.path))

  const closeDialog = (): void => {
    setDialogMode(null)
    clear()
  }

  return (
    <>
      <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
        <span className="mr-1 text-muted-foreground">{selectedPaths.size}개 선택됨</span>
        <Button size="sm" variant="ghost" onClick={() => selectAll(allEntries.map((e) => e.path))}>
          전체 선택
        </Button>
        <Button size="sm" variant="ghost" onClick={clear}>
          선택 해제
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setDialogMode('rename')}>
          이름 변경
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setDialogMode('delete')}>
          삭제
        </Button>
      </div>
      <RenameDialog
        key={dialogMode === 'rename' ? selectedEntries.map((e) => e.path).join('|') : 'closed'}
        targets={dialogMode === 'rename' ? selectedEntries : []}
        onClose={closeDialog}
      />
      <DeleteConfirmDialog
        key={dialogMode === 'delete' ? selectedEntries.map((e) => e.path).join('|') : 'closed'}
        targets={dialogMode === 'delete' ? selectedEntries : []}
        onClose={closeDialog}
      />
    </>
  )
}
