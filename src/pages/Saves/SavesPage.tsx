import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Input } from '../../components/ui/input'
import { useGameCoverImage, useGameMetadata } from '../../services/metadataService'
import { useGamesWithSavePath, useSaveSnapshots } from '../../services/saveService'
import { useGames } from '../../services/useGames'
import { SaveManagerDialog } from '../../components/game/SaveManagerDialog'
import { parseCodeInput } from '../DlsiteSearch/parseCodeInput'
import { filterSaveGamesBySnapshotCounts } from './filterSaveGamesBySnapshotCounts'
import { useTranslation } from '../../i18n/useTranslation'
import type { GameCode } from '../../../shared/types/scanner'

interface ManagingEntry {
  code: GameCode | null
  path: string
  name: string
  savePath: string
}

// A code-linked game's row is keyed by its code, not a path (it isn't tied
// to one - the same code could be relinked to a different folder later), so
// game_user_data never stores a path for it. detectGameVersion (used for
// this dialog's auto-version-detect and restore-time mismatch check) needs
// the game's actual folder on disk, though - resolved here from whatever
// library scan is already in the React Query cache (the same one Gallery/
// List/DetailList populate), not from anything persisted. A code with no
// currently-scanned match (its library was removed, or hasn't been scanned
// yet) falls back to '' - the same degraded-but-safe behavior as before
// this lookup existed (detectGameVersion treats an empty/nonexistent folder
// path as "nothing detected", not an error).
function usePathByCode(): Map<string, string> {
  const { data: scannedGames } = useGames()
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of scannedGames ?? []) {
      if (entry.code) map.set(entry.code.value, entry.path)
    }
    return map
  }, [scannedGames])
}

function SaveEntryRow({
  entryKey,
  savePath,
  pathByCode,
  onSnapshotCount,
  onManage,
}: {
  entryKey: string
  savePath: string
  pathByCode: Map<string, string>
  onSnapshotCount: (entryKey: string, count: number) => void
  onManage: (entry: ManagingEntry) => void
}) {
  const { t } = useTranslation()
  const code = parseCodeInput(entryKey)
  const entry = { code, path: code ? (pathByCode.get(code.value) ?? '') : entryKey }
  const { data: metadata } = useGameMetadata(code)
  const { data: coverImage } = useGameCoverImage(metadata?.coverImagePath ? code : null)
  const { data: snapshots } = useSaveSnapshots(entry)

  useEffect(() => {
    if (!snapshots) return
    onSnapshotCount(entryKey, snapshots.length)
  }, [entryKey, onSnapshotCount, snapshots])

  if (snapshots && snapshots.length === 0) return null

  return (
    <button
      onClick={() =>
        onManage({ code, path: entry.path, name: metadata?.title ?? entryKey, savePath })
      }
      className="flex w-full items-center gap-3 border-b border-border px-4 py-2 text-left text-sm transition-colors hover:bg-accent"
    >
      {/* whileHover scale: matches the icon/thumbnail-level hover treatment
          already established elsewhere (FolderView.tsx's EntryIcon) - this
          page had zero framer-motion despite every comparable browsing view
          giving its thumbnail some hover feedback. */}
      <motion.div
        whileHover={{ scale: 1.08 }}
        transition={{ duration: 0.15 }}
        className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted"
      >
        {coverImage && (
          <img src={coverImage} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </motion.div>
      <div className="min-w-0 flex-1">
        <p className="truncate">{metadata?.title ?? entryKey}</p>
        {code && <p className="truncate text-xs text-muted-foreground">{code.value}</p>}
      </div>
      {/* min-w-0 (not shrink-0) - shrink-0 and truncate are self-cancelling:
          shrink-0 refuses to shrink below content width, so truncate's
          overflow-hidden/ellipsis never has a narrower box to actually
          apply to. min-w-0 lets this shrink alongside the row instead. */}
      <span className="min-w-0 truncate text-xs text-muted-foreground" title={savePath}>
        {savePath}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {t('saveManager.snapshotCount', { count: snapshots?.length ?? 0 })}
      </span>
    </button>
  )
}

export function SavesPage() {
  const { t } = useTranslation()
  const { data: games, isLoading } = useGamesWithSavePath()
  const pathByCode = usePathByCode()
  const [managing, setManaging] = useState<ManagingEntry | null>(null)
  const [search, setSearch] = useState('')
  const [snapshotCounts, setSnapshotCounts] = useState<Map<string, number>>(new Map())

  const handleSnapshotCount = (entryKey: string, count: number): void => {
    setSnapshotCounts((prev) => {
      if (prev.get(entryKey) === count) return prev
      const next = new Map(prev)
      next.set(entryKey, count)
      return next
    })
  }

  if (isLoading || !games) return null

  if (games.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('saveManager.noGamesWithSavePath')}
      </div>
    )
  }

  const filteredGames = search.trim()
    ? games.filter((game) => game.key.toLowerCase().includes(search.trim().toLowerCase()))
    : games
  const visibleGames = filterSaveGamesBySnapshotCounts(filteredGames, snapshotCounts)

  return (
    // h-full: the empty-state branch below uses flex-1 items-center
    // justify-center to vertically center its message, which needs a
    // sized parent to fill - without it, this column is only as tall as
    // its own content, flex-1 has nothing to distribute, and the message
    // sits right under the search bar instead of centered in the page.
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-2">
        <Input
          className="h-8"
          placeholder={t('saveManager.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {visibleGames.length === 0 && filteredGames.every((game) => snapshotCounts.has(game.key)) && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {search.trim() ? t('common.noItemsToShow') : t('saveManager.noSnapshots')}
        </div>
      )}
      {visibleGames.map((game) => (
        <SaveEntryRow
          key={game.key}
          entryKey={game.key}
          savePath={game.savePath}
          pathByCode={pathByCode}
          onSnapshotCount={handleSnapshotCount}
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
