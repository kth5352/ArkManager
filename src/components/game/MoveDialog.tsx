import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useMoveEntries, usePickMoveDestination } from '../../services/fileOpsService'
import type { MoveResultDto } from '../../../shared/types/ipc'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface MoveDialogProps {
  targets: ScannedEntry[]
  onClose: () => void
}

// A manually-linked code and any favorite/rating/memo/playtime/custom cover
// for a code-less entry both move with it automatically (see
// EXPLORER_MOVE_ENTRIES's rekeyPathCodeOverride/rekeyPath) - nothing extra
// for the user to do here beyond picking the destination.
export function MoveDialog({ targets, onClose }: MoveDialogProps) {
  const [destDir, setDestDir] = useState<string | null>(null)
  const [results, setResults] = useState<MoveResultDto[] | null>(null)
  const pickDestination = usePickMoveDestination()
  const moveEntries = useMoveEntries()

  const handlePickDestination = async (): Promise<void> => {
    const dir = await pickDestination.mutateAsync()
    if (dir) setDestDir(dir)
  }

  const handleMove = (): void => {
    if (!destDir) return
    moveEntries.mutate({ paths: targets.map((t) => t.path), destDir }, { onSuccess: setResults })
  }

  return (
    <Dialog open={targets.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{targets.length}개 항목 이동</DialogTitle>
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
            <Button variant="secondary" onClick={handlePickDestination}>
              대상 폴더 선택
            </Button>
            {destDir && <p className="truncate text-xs text-muted-foreground">대상: {destDir}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                취소
              </Button>
              <Button onClick={handleMove} disabled={!destDir || moveEntries.isPending}>
                {moveEntries.isPending ? '이동 중...' : '이동'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
