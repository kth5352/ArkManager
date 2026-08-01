import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useDeleteEntries } from '../../services/fileOpsService'
import type { DeleteResultDto } from '../../../shared/types/ipc'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface DeleteConfirmDialogProps {
  targets: ScannedEntry[]
  onClose: () => void
}

export function DeleteConfirmDialog({ targets, onClose }: DeleteConfirmDialogProps) {
  const [results, setResults] = useState<DeleteResultDto[] | null>(null)
  const deleteEntries = useDeleteEntries()

  const handleConfirm = (): void => {
    deleteEntries.mutate(
      targets.map((t) => t.path),
      { onSuccess: setResults }
    )
  }

  return (
    <Dialog open={targets.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{targets.length}개 항목을 휴지통으로 이동</DialogTitle>
        </DialogHeader>

        {results ? (
          <div className="flex flex-col gap-2">
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-xs">
              {results.map((r) => (
                <li
                  key={r.path}
                  className={r.success ? 'text-muted-foreground' : 'text-destructive'}
                >
                  {r.success ? '완료' : `실패: ${r.error}`} -{' '}
                  {targets.find((t) => t.path === r.path)?.name ?? r.path}
                </li>
              ))}
            </ul>
            <Button onClick={onClose}>닫기</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2 text-xs">
              {targets.map((t) => (
                <li key={t.path} className="truncate text-muted-foreground">
                  {t.name}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              파일은 휴지통으로 이동하며, 필요하면 휴지통에서 복구할 수 있습니다.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={deleteEntries.isPending}
              >
                {deleteEntries.isPending ? '이동 중...' : '휴지통으로 이동'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
