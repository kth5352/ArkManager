import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useRenameEntries } from '../../services/fileOpsService'
import { buildRenamePlan } from '../../lib/buildRenamePlan'
import type { RenameResultDto } from '../../../shared/types/ipc'
import type { ScannedEntry } from '../../../shared/types/scanner'

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

interface RenameDialogProps {
  // Empty array means closed - a single target renders a plain text field,
  // 2+ renders a pattern-based batch preview (see buildRenamePlan). Key
  // this component on the target paths at the call site so a fresh open
  // (single item, or a different selection) always starts from clean local
  // state instead of carrying over the previous open's draft.
  targets: ScannedEntry[]
  onClose: () => void
}

export function RenameDialog({ targets, onClose }: RenameDialogProps) {
  const isBulk = targets.length > 1
  const [singleName, setSingleName] = useState(() => targets[0]?.name ?? '')
  const [pattern, setPattern] = useState('')
  const [results, setResults] = useState<RenameResultDto[] | null>(null)
  const renameEntries = useRenameEntries()

  const preview = isBulk ? buildRenamePlan(targets, pattern) : []
  const hasDuplicateInBatch = new Set(preview.map((p) => p.newName)).size !== preview.length

  const handleApply = (): void => {
    const renames = isBulk
      ? preview.map((p, i) => ({ path: targets[i].path, newName: p.newName }))
      : targets[0]
        ? [{ path: targets[0].path, newName: singleName.trim() }]
        : []
    if (renames.length === 0) return
    renameEntries.mutate(renames, { onSuccess: setResults })
  }

  return (
    <Dialog open={targets.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isBulk ? `이름 일괄 변경 (${targets.length}개)` : '이름 변경'}</DialogTitle>
        </DialogHeader>

        {results ? (
          <div className="flex flex-col gap-2">
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-xs">
              {results.map((r) => (
                <li
                  key={r.path}
                  className={r.success ? 'text-muted-foreground' : 'text-destructive'}
                >
                  {r.success ? `완료: ${basename(r.newPath ?? r.path)}` : `실패: ${r.error}`}
                </li>
              ))}
            </ul>
            <Button onClick={onClose}>닫기</Button>
          </div>
        ) : isBulk ? (
          <div className="flex flex-col gap-3">
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="예: 아마카노 {index} - {name}{ext}"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {'{name}'}: 원래 이름 · {'{ext}'}: 확장자 · {'{index}'}: 순번(1부터) · {'{index:2}'}:
              0으로 채운 순번. {'{ext}'}를 생략하면 파일 확장자는 자동으로 유지됩니다.
            </p>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2 text-xs">
              {preview.map((p, i) => (
                <li key={targets[i].path} className="truncate text-muted-foreground">
                  {p.oldName} → <span className="text-foreground">{p.newName}</span>
                </li>
              ))}
            </ul>
            {hasDuplicateInBatch && (
              <p className="text-xs text-destructive">
                변경 후 이름이 서로 중복됩니다. 패턴을 확인하세요.
              </p>
            )}
            <Button
              onClick={handleApply}
              disabled={!pattern.trim() || hasDuplicateInBatch || renameEntries.isPending}
            >
              {renameEntries.isPending ? '변경 중...' : '일괄 변경'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              value={singleName}
              onChange={(e) => setSingleName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
            />
            <Button onClick={handleApply} disabled={!singleName.trim() || renameEntries.isPending}>
              {renameEntries.isPending ? '변경 중...' : '변경'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
