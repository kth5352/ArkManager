import { useState } from 'react'
import { Button } from '../ui/button'
import { RenameDialog } from '../game/RenameDialog'
import { DeleteConfirmDialog } from '../game/DeleteConfirmDialog'
import { MoveDialog } from '../game/MoveDialog'
import { useSelectionStore } from '../../stores/selectionStore'
import { useTranslation } from '../../i18n/useTranslation'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface SelectionToolbarProps {
  // The current page's own filtered/sorted list - used to resolve selected
  // paths back into entries, and as the target set for "전체 선택".
  allEntries: ScannedEntry[]
}

// Pushed to the far right of the toolbar row via ml-auto - while inactive
// this is just the one small "선택" entry point; once active it becomes the
// full selection cluster ending in "취소", so both states read as
// consistently anchored to the top-right rather than jumping position.
export function SelectionToolbar({ allEntries }: SelectionToolbarProps) {
  const { t } = useTranslation()
  const isActive = useSelectionStore((s) => s.isActive)
  const selectedPaths = useSelectionStore((s) => s.selectedPaths)
  const activate = useSelectionStore((s) => s.activate)
  const deactivate = useSelectionStore((s) => s.deactivate)
  const selectAll = useSelectionStore((s) => s.selectAll)
  const [dialogMode, setDialogMode] = useState<'rename' | 'delete' | 'move' | null>(null)

  if (!isActive) {
    return (
      <Button size="sm" variant="ghost" className="ml-auto shrink-0" onClick={() => activate()}>
        {t('selection.select')}
      </Button>
    )
  }

  const selectedEntries = allEntries.filter((e) => selectedPaths.has(e.path))

  const closeDialog = (): void => {
    setDialogMode(null)
    deactivate()
  }

  return (
    <>
      <div className="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
        <span className="mr-1 whitespace-nowrap text-muted-foreground">
          {t('selection.selectedCount', { count: selectedPaths.size })}
        </span>
        <Button size="sm" variant="ghost" onClick={() => selectAll(allEntries.map((e) => e.path))}>
          {t('selection.selectAll')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDialogMode('rename')}
          disabled={selectedPaths.size === 0}
        >
          {t('selection.rename')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDialogMode('move')}
          disabled={selectedPaths.size === 0}
        >
          {t('selection.move')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setDialogMode('delete')}
          disabled={selectedPaths.size === 0}
        >
          {t('common.delete')}
        </Button>
        <Button size="sm" variant="ghost" onClick={deactivate}>
          {t('common.cancel')}
        </Button>
      </div>
      {/* Each dialog's own fallback key must be unique across these three
          siblings, not just per-dialog - dialogMode is only ever one value
          at a time, so the other two both fell back to the exact same
          literal 'closed' key simultaneously, tripping React's "two
          children with the same key" warning on every render. */}
      <RenameDialog
        key={
          dialogMode === 'rename' ? selectedEntries.map((e) => e.path).join('|') : 'rename-closed'
        }
        targets={dialogMode === 'rename' ? selectedEntries : []}
        onCompleted={deactivate}
        onClose={closeDialog}
      />
      <DeleteConfirmDialog
        key={
          dialogMode === 'delete' ? selectedEntries.map((e) => e.path).join('|') : 'delete-closed'
        }
        targets={dialogMode === 'delete' ? selectedEntries : []}
        onClose={closeDialog}
      />
      <MoveDialog
        key={dialogMode === 'move' ? selectedEntries.map((e) => e.path).join('|') : 'move-closed'}
        targets={dialogMode === 'move' ? selectedEntries : []}
        onClose={closeDialog}
      />
    </>
  )
}
