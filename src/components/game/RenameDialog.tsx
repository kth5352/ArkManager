import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useRenameEntries } from '../../services/fileOpsService'
import { useGameMetadataMany } from '../../services/metadataService'
import {
  buildRenamePlan,
  DEFAULT_RENAME_PATTERN,
  type RenameTarget,
} from '../../lib/buildRenamePlan'
import { useTranslation } from '../../i18n/useTranslation'
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
  const { t } = useTranslation()
  const isBulk = targets.length > 1
  const [singleName, setSingleName] = useState(() => targets[0]?.name ?? '')
  const [pattern, setPattern] = useState(DEFAULT_RENAME_PATTERN)
  const [results, setResults] = useState<RenameResultDto[] | null>(null)
  const renameEntries = useRenameEntries()

  const codes = targets.flatMap((t) => (t.code ? [t.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)

  const richTargets: RenameTarget[] = targets.map((t) => {
    const metadata = t.code ? metadataByCode[t.code.value] : undefined
    return {
      name: t.name,
      kind: t.kind,
      code: t.code?.value ?? null,
      circle: metadata?.circle ?? null,
      title: metadata?.title ?? null,
      genres: metadata?.genres ?? [],
    }
  })

  const preview = isBulk ? buildRenamePlan(richTargets, pattern) : []
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
          <DialogTitle>
            {isBulk ? t('rename.bulkTitle', { count: targets.length }) : t('rename.title')}
          </DialogTitle>
        </DialogHeader>

        {results ? (
          <div className="flex flex-col gap-2">
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-xs">
              {results.map((r) => (
                <li
                  key={r.path}
                  className={r.success ? 'text-muted-foreground' : 'text-destructive'}
                >
                  {r.success
                    ? t('rename.completed', { name: basename(r.newPath ?? r.path) })
                    : t('fileOps.failed', { error: r.error ?? '' })}
                </li>
              ))}
            </ul>
            <Button onClick={onClose}>{t('common.close')}</Button>
          </div>
        ) : isBulk ? (
          <div className="flex flex-col gap-3">
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={DEFAULT_RENAME_PATTERN}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{t('rename.tokenHelp')}</p>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2 text-xs">
              {preview.map((p, i) => (
                <li key={targets[i].path} className="truncate text-muted-foreground">
                  {p.oldName} → <span className="text-foreground">{p.newName}</span>
                </li>
              ))}
            </ul>
            {hasDuplicateInBatch && (
              <p className="text-xs text-destructive">{t('rename.duplicateNames')}</p>
            )}
            <Button
              onClick={handleApply}
              disabled={!pattern.trim() || hasDuplicateInBatch || renameEntries.isPending}
            >
              {renameEntries.isPending ? t('rename.changing') : t('rename.bulkApply')}
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
              {renameEntries.isPending ? t('rename.changing') : t('rename.apply')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
