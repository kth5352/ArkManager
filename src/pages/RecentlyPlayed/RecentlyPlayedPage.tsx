import { useRecentlyPlayed } from '../../services/gameUserDataService'
import { useGameMetadata } from '../../services/metadataService'
import { useGameUserData } from '../../services/gameUserDataService'
import { formatPlaytime } from './formatPlaytime'
import type { GameCode } from '../../../shared/types/scanner'

function codeFromKey(key: string): GameCode | null {
  const match = /^(RJ|VJ|ST)(\d+)$/.exec(key)
  if (!match) return null
  return { type: match[1] as GameCode['type'], value: key }
}

function RecentlyPlayedRow({ entryKey, lastPlayedAt }: { entryKey: string; lastPlayedAt: string }) {
  const code = codeFromKey(entryKey)
  const { data: metadata } = useGameMetadata(code)
  const { data: userData } = useGameUserData({ code, path: code ? '' : entryKey })

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm">
      <span>{metadata?.title ?? entryKey}</span>
      <span className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatPlaytime(userData?.totalPlaytimeMs ?? 0)}</span>
        <span>{lastPlayedAt.slice(0, 10)}</span>
      </span>
    </div>
  )
}

export function RecentlyPlayedPage() {
  const { data: recent, isLoading } = useRecentlyPlayed()

  if (isLoading || !recent) return null

  if (recent.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        아직 플레이한 게임이 없습니다.
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {recent.map((entry) => (
        <RecentlyPlayedRow key={entry.key} entryKey={entry.key} lastPlayedAt={entry.lastPlayedAt} />
      ))}
    </div>
  )
}
