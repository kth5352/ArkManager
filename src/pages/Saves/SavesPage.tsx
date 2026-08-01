import { useState } from 'react'
import { useGameCoverImage, useGameMetadata } from '../../services/metadataService'
import { useGamesWithSavePath, useSaveSnapshots } from '../../services/saveService'
import { SaveManagerDialog } from '../../components/game/SaveManagerDialog'
import { useTranslation } from '../../i18n/useTranslation'
import type { GameCode } from '../../../shared/types/scanner'

interface ManagingEntry {
  code: GameCode | null
  path: string
  name: string
  savePath: string
}

function codeFromKey(key: string): GameCode | null {
  const match = /^(RJ|VJ|ST)(\d+)$/.exec(key)
  if (!match) return null
  return { type: match[1] as GameCode['type'], value: key }
}

function SaveEntryRow({
  entryKey,
  savePath,
  onManage,
}: {
  entryKey: string
  savePath: string
  onManage: (entry: ManagingEntry) => void
}) {
  const { t } = useTranslation()
  const code = codeFromKey(entryKey)
  const entry = { code, path: code ? '' : entryKey }
  const { data: metadata } = useGameMetadata(code)
  const { data: coverImage } = useGameCoverImage(metadata?.coverImagePath ? code : null)
  const { data: snapshots } = useSaveSnapshots(entry)

  return (
    <button
      onClick={() =>
        onManage({ code, path: entry.path, name: metadata?.title ?? entryKey, savePath })
      }
      className="flex w-full items-center gap-3 border-b border-border px-4 py-2 text-left text-sm transition-colors hover:bg-accent"
    >
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
        {coverImage && (
          <img src={coverImage} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate">{metadata?.title ?? entryKey}</p>
        {code && <p className="truncate text-xs text-muted-foreground">{code.value}</p>}
      </div>
      <span className="shrink-0 truncate text-xs text-muted-foreground">{savePath}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {t('saveManager.snapshotCount', { count: snapshots?.length ?? 0 })}
      </span>
    </button>
  )
}

export function SavesPage() {
  const { t } = useTranslation()
  const { data: games, isLoading } = useGamesWithSavePath()
  const [managing, setManaging] = useState<ManagingEntry | null>(null)

  if (isLoading || !games) return null

  if (games.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('saveManager.noGamesWithSavePath')}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {games.map((game) => (
        <SaveEntryRow
          key={game.key}
          entryKey={game.key}
          savePath={game.savePath}
          onManage={setManaging}
        />
      ))}
      <SaveManagerDialog
        entry={managing}
        savePath={managing?.savePath ?? null}
        onClose={() => setManaging(null)}
      />
    </div>
  )
}
