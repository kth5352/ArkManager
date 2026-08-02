// src/components/game/SaveManagerDialog.tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useTranslation } from '../../i18n/useTranslation'
import {
  useCreateSaveSnapshot,
  useRestoreSaveSnapshot,
  useSaveDiff,
  useSaveSnapshots,
  useSetSnapshotLabel,
  useDeleteSnapshot,
  useDeleteAllSnapshots,
  useShowSnapshotInFolder,
  useCheckVersionMismatch,
} from '../../services/saveService'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { SaveDiffStatus, VersionMismatchDto } from '../../../shared/types/ipc'

interface SaveManagerDialogProps {
  entry: Pick<ScannedEntry, 'code' | 'path' | 'name'> | null
  savePath: string | null
  onClose: () => void
}

// Snapshot directory names are createSnapshot.ts's timestampToDirName
// output (an ISO string with : and . replaced by -) - parsed back here
// only for display.
function formatTimestamp(timestamp: string): string {
  const iso = timestamp.replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-\d{3}Z$/,
    '$1T$2:$3:$4Z'
  )
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString()
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Restoring an older snapshot onto the live save folder is the mirror image
// of saving a new one from it - the same backend diff (snapshot vs live) is
// reused for both previews, just relabeled: a file only in the snapshot
// ("removed" from the save-preview's point of view, since it's gone from
// live) is something a restore would ADD BACK, and vice versa.
function displayStatus(status: SaveDiffStatus, mode: 'save' | 'restore'): SaveDiffStatus {
  if (mode === 'save' || status === 'modified') return status
  return status === 'added' ? 'removed' : 'added'
}

const STATUS_STYLES: Record<SaveDiffStatus, string> = {
  added: 'text-green-500',
  removed: 'text-destructive',
  modified: 'text-yellow-500',
}
const STATUS_SYMBOLS: Record<SaveDiffStatus, string> = { added: '+', removed: '-', modified: '~' }

type PendingAction =
  | { type: 'save'; against: string | null }
  | { type: 'restore'; timestamp: string }
  | { type: 'delete'; timestamp: string }
  | { type: 'deleteAll'; step: 1 | 2 }

function VersionBadge({
  entry,
  timestamp,
  version,
  onSave,
}: {
  entry: Pick<ScannedEntry, 'code' | 'path'> | null
  timestamp: string
  version: string | null
  onSave: ReturnType<typeof useSetSnapshotLabel>
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <input
        autoFocus
        className="w-20 rounded border border-border bg-transparent px-1 text-xs text-foreground"
        defaultValue={version ?? ''}
        onBlur={(e) => {
          setEditing(false)
          if (!entry) return
          const next = e.target.value
          if (next !== (version ?? '')) {
            onSave.mutate({ entry, timestamp, updates: { version: next } })
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
      onClick={() => setEditing(true)}
    >
      {version ? `v${version}` : t('saveManager.versionPlaceholder')}
    </button>
  )
}

export function SaveManagerDialog({ entry, savePath, onClose }: SaveManagerDialogProps) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [mismatch, setMismatch] = useState<{ timestamp: string; result: VersionMismatchDto } | null>(
    null
  )
  const { data: snapshots } = useSaveSnapshots(entry)
  const { data: diff } = useSaveDiff(
    entry,
    pending?.type === 'save' ? pending.against : pending?.type === 'restore' ? pending.timestamp : null,
    pending !== null && (pending.type === 'save' || pending.type === 'restore')
  )
  const createSnapshot = useCreateSaveSnapshot()
  const restoreSnapshot = useRestoreSaveSnapshot()
  const setSnapshotLabel = useSetSnapshotLabel()
  const deleteSnapshot = useDeleteSnapshot()
  const deleteAllSnapshots = useDeleteAllSnapshots()
  const showSnapshotInFolder = useShowSnapshotInFolder()
  const checkVersionMismatch = useCheckVersionMismatch()

  const handleClose = (): void => {
    setPending(null)
    setMismatch(null)
    onClose()
  }

  const handleConfirmSave = (): void => {
    if (!entry) return
    createSnapshot.mutate(entry, { onSuccess: () => setPending(null) })
  }

  const handleClickRestore = (timestamp: string): void => {
    if (!entry) return
    const snapshot = (snapshots ?? []).find((s) => s.timestamp === timestamp)
    if (snapshot?.version) {
      checkVersionMismatch.mutate(
        { entry, timestamp },
        {
          onSuccess: (result) => {
            if (result.isSnapshotNewer) {
              setMismatch({ timestamp, result })
            } else {
              setPending({ type: 'restore', timestamp })
            }
          },
        }
      )
    } else {
      setPending({ type: 'restore', timestamp })
    }
  }

  const handleConfirmRestore = (): void => {
    if (!entry || pending?.type !== 'restore') return
    restoreSnapshot.mutate(
      { entry, timestamp: pending.timestamp },
      { onSuccess: () => setPending(null) }
    )
  }

  const handleConfirmDelete = (): void => {
    if (!entry || pending?.type !== 'delete') return
    deleteSnapshot.mutate(
      { entry, timestamp: pending.timestamp },
      { onSuccess: () => setPending(null) }
    )
  }

  const handleConfirmDeleteAll = (): void => {
    if (!entry) return
    deleteAllSnapshots.mutate(entry, { onSuccess: () => setPending(null) })
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('saveManager.title')} {entry ? `- ${entry.name}` : ''}
          </DialogTitle>
        </DialogHeader>

        {!savePath ? (
          <p className="text-sm text-muted-foreground">{t('saveManager.noSavePath')}</p>
        ) : mismatch !== null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-yellow-500">
              {t('saveManager.versionMismatchWarning', {
                snapshotVersion: mismatch.result.snapshotVersion ?? '',
                currentVersion: mismatch.result.currentVersion ?? '',
              })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMismatch(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const timestamp = mismatch.timestamp
                  setMismatch(null)
                  setPending({ type: 'restore', timestamp })
                }}
              >
                {t('saveManager.restoreAnyway')}
              </Button>
            </div>
          </div>
        ) : pending === null ? (
          <>
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  setPending({ type: 'save', against: snapshots?.[0]?.timestamp ?? null })
                }
              >
                {t('saveManager.saveNew')}
              </Button>
              {(snapshots ?? []).length > 0 && (
                <Button variant="destructive" onClick={() => setPending({ type: 'deleteAll', step: 1 })}>
                  {t('saveManager.deleteAll')}
                </Button>
              )}
            </div>
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {(snapshots ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">{t('saveManager.noSnapshots')}</p>
              )}
              {(snapshots ?? []).map((snapshot) => (
                <div
                  key={snapshot.timestamp}
                  className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span>{formatTimestamp(snapshot.timestamp)}</span>
                      <VersionBadge
                        entry={entry}
                        timestamp={snapshot.timestamp}
                        version={snapshot.version}
                        onSave={setSnapshotLabel}
                      />
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t('saveManager.snapshotMeta', {
                        count: snapshot.fileCount,
                        size: formatSize(snapshot.totalSizeBytes),
                      })}
                    </span>
                  </div>
                  <input
                    className="rounded border border-border bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
                    placeholder={t('saveManager.memoPlaceholder')}
                    defaultValue={snapshot.memo ?? ''}
                    onBlur={(e) => {
                      if (!entry) return
                      const memo = e.target.value
                      if (memo !== (snapshot.memo ?? '')) {
                        setSnapshotLabel.mutate({ entry, timestamp: snapshot.timestamp, updates: { memo } })
                      }
                    }}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => entry && showSnapshotInFolder.mutate({ entry, timestamp: snapshot.timestamp })}
                    >
                      {t('game.openFolder')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPending({ type: 'delete', timestamp: snapshot.timestamp })}
                    >
                      {t('common.delete')}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleClickRestore(snapshot.timestamp)}>
                      {t('saveManager.restore')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : pending.type === 'delete' ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">{t('saveManager.deleteSnapshotConfirm')}</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteSnapshot.isPending}>
                {t('common.delete')}
              </Button>
            </div>
          </div>
        ) : pending.type === 'deleteAll' ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {pending.step === 1
                ? t('saveManager.deleteAllConfirm1')
                : t('saveManager.deleteAllConfirm2', { count: snapshots?.length ?? 0 })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  pending.step === 1
                    ? setPending({ type: 'deleteAll', step: 2 })
                    : handleConfirmDeleteAll()
                }
                disabled={deleteAllSnapshots.isPending}
              >
                {t('saveManager.deleteAll')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium">
              {pending.type === 'save'
                ? t('saveManager.saveDiffTitle')
                : t('saveManager.restoreDiffTitle')}
            </p>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {diff === undefined ? null : diff.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('saveManager.noDifferences')}</p>
              ) : (
                diff.map((d) => {
                  const status = displayStatus(d.status, pending.type)
                  return (
                    <div key={d.relativePath} className="flex items-center gap-2 text-xs">
                      <span className={STATUS_STYLES[status]}>{STATUS_SYMBOLS[status]}</span>
                      <span className="truncate">{d.relativePath}</span>
                    </div>
                  )
                })
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </Button>
              {pending.type === 'save' ? (
                <Button onClick={handleConfirmSave} disabled={createSnapshot.isPending}>
                  {t('saveManager.confirmSave')}
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={handleConfirmRestore}
                  disabled={restoreSnapshot.isPending}
                >
                  {t('saveManager.confirmRestore')}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
