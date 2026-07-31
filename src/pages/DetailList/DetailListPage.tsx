import { List, type RowComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { useState } from 'react'
import { Star } from 'lucide-react'
import { useGames } from '../../services/useGames'
import { useGameMetadataMany } from '../../services/metadataService'
import { useGameUserData } from '../../services/gameUserDataService'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import { filterEntries } from '../../lib/filterEntries'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { Skeleton } from '../../components/ui/skeleton'
import { useGameDetailOverlay } from '../../hooks/useGameDetailOverlay'
import type { ScannedEntry } from '../../../shared/types/scanner'

const ROW_HEIGHT = 32

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)}${units[unitIndex]}`
}

function formatDate(mtimeMs: number): string {
  return new Date(mtimeMs).toISOString().slice(0, 10)
}

interface DetailListRowProps {
  entries: ScannedEntry[]
  metadataByCode: Record<string, { genres: string[] }>
  onOpenDetail: (entry: ScannedEntry) => void
}

function Row({
  index,
  style,
  entries,
  metadataByCode,
  onOpenDetail,
}: RowComponentProps<DetailListRowProps>) {
  const entry = entries[index]
  const { data: userData } = useGameUserData(entry ?? { code: null, path: '' })
  if (!entry) return null
  const genres = entry.code ? (metadataByCode[entry.code.value]?.genres ?? []) : []

  return (
    <div
      style={style}
      className="flex cursor-pointer items-center gap-4 border-b border-border px-4 text-xs text-muted-foreground"
      onClick={() => onOpenDetail(entry)}
    >
      <span className="w-28 shrink-0 truncate">{entry.code?.value ?? '-'}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{entry.name}</span>
      <span className="w-64 shrink-0 truncate">{entry.path}</span>
      <span className="w-40 shrink-0 truncate">{genres.join(', ')}</span>
      <span className="w-24 shrink-0">{formatDate(entry.mtimeMs)}</span>
      <span className="w-20 shrink-0">{formatSize(entry.size)}</span>
      <span className="flex w-16 shrink-0 gap-0.5">
        {userData?.rating != null &&
          [1, 2, 3, 4, 5].map((value) => (
            <Star
              key={value}
              className="h-3 w-3 text-yellow-500"
              fill={value <= (userData.rating ?? 0) ? 'currentColor' : 'none'}
            />
          ))}
      </span>
    </div>
  )
}

export function DetailListPage() {
  const { data: games, isLoading, isError } = useGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('detail-list')
  const [searchQuery, setSearchQuery] = useState('')
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const { openDetail, detailOverlayElement } = useGameDetailOverlay(games ?? [])

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)

  if (isError && !games) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        라이브러리를 스캔하는 중 오류가 발생했습니다.
      </div>
    )
  }

  if (isLoading || !games) {
    return (
      <div className="flex flex-col gap-1 p-4">
        {Array.from({ length: 15 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }

  const filtered = filterEntries(games, metadataByCode, searchQuery, excludedGenres)
  const sorted = sortEntries(filtered, sortField, sortDirection)

  return (
    <div className="flex h-full flex-col">
      <SearchHeader
        query={searchQuery}
        onQueryChange={setSearchQuery}
        excludedGenres={excludedGenres}
        onClearFilters={() => setExcludedGenres([])}
      />
      <PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />
      {sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          표시할 항목이 없습니다.
        </div>
      ) : (
        <div className="h-full w-full">
          <AutoSizer
            style={{ height: '100%', width: '100%' }}
            renderProp={({ height, width }) => {
              if (height === undefined || width === undefined) return null
              return (
                <List
                  rowComponent={Row}
                  rowProps={{ entries: sorted, metadataByCode, onOpenDetail: openDetail }}
                  rowCount={sorted.length}
                  rowHeight={ROW_HEIGHT}
                  style={{ height, width }}
                />
              )
            }}
          />
        </div>
      )}
      {detailOverlayElement}
    </div>
  )
}
