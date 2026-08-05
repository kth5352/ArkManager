import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import {
  useCrawlGameMetadata,
  useGameCoverImage,
  useGameMetadata,
  useSearchDlsite,
  useSearchGetchu,
  useSearchSteam,
  useSearchVndb,
} from '../../services/metadataService'
import { IndeterminateProgressBar } from '../../components/ui/progress-bar'
import { parseCodeInput } from '../DlsiteSearch/parseCodeInput'
import { useTranslation } from '../../i18n/useTranslation'
import type { GameCode } from '../../../shared/types/scanner'
import type {
  DlsiteSearchResultDto,
  GetchuSearchResultDto,
  SteamSearchResultDto,
  VndbSearchResultDto,
} from '../../../shared/types/ipc'

type SearchSource = 'all' | 'dlsite' | 'steam' | 'vndb' | 'getchu'
type SearchResult =
  | DlsiteSearchResultDto
  | SteamSearchResultDto
  | VndbSearchResultDto
  | GetchuSearchResultDto
interface SourceSearchState {
  data: SearchResult[] | undefined
  isPending: boolean
  isError: boolean
}

function renderResultCard(result: SearchResult, onSelect: (result: SearchResult) => void) {
  return (
    <button
      key={result.code.value}
      onClick={() => onSelect(result)}
      className="flex items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent"
    >
      <div className="h-16 w-12 shrink-0 overflow-hidden rounded bg-muted">
        {result.thumbnailUrl && (
          <img
            src={result.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        )}
      </div>
      <div className="flex flex-col gap-0.5 text-sm">
        <p className="font-medium">{result.title}</p>
        <p className="text-xs text-muted-foreground">{result.code.value}</p>
      </div>
    </button>
  )
}

// Renders one source's group within the "All" tab: a label header plus
// that source's own pending/error/results state - independent of the other
// sources, so a slow DLsite scrape doesn't block already-arrived
// Steam/VNDB/getchu results from showing. Returns null (renders nothing,
// group omitted entirely) once settled with zero results, rather than
// showing an empty header.
function renderSourceGroup(
  label: string,
  search: SourceSearchState,
  onSelect: (result: SearchResult) => void,
  searchingText: string,
  errorText: string
) {
  if (search.isPending) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <div className="flex max-w-xs flex-col gap-1">
          <IndeterminateProgressBar />
          <p className="text-xs text-muted-foreground">{searchingText}</p>
        </div>
      </div>
    )
  }
  if (search.isError) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{errorText}</p>
      </div>
    )
  }
  if (search.data === undefined || search.data.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="flex flex-col gap-1">
        {search.data.map((result) => renderResultCard(result, onSelect))}
      </div>
    </div>
  )
}

export function GameSearchPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [source, setSource] = useState<SearchSource>('all')
  const [activeCode, setActiveCode] = useState<GameCode | null>(null)
  const [lastQuery, setLastQuery] = useState('')

  const { data: metadata, isLoading } = useGameMetadata(activeCode)
  const crawlAndSave = useCrawlGameMetadata()
  const searchDlsite = useSearchDlsite()
  const searchSteam = useSearchSteam()
  const searchVndb = useSearchVndb()
  const searchGetchu = useSearchGetchu()
  const { data: coverImage } = useGameCoverImage(metadata?.coverImagePath ? activeCode : null)

  // Only meaningful for the 4 single-source tabs - 'all' fires and renders
  // all four at once instead (see the grouped rendering below).
  const activeSearch =
    source === 'dlsite'
      ? searchDlsite
      : source === 'steam'
        ? searchSteam
        : source === 'vndb'
          ? searchVndb
          : searchGetchu

  const selectResult = (result: SearchResult): void => {
    setActiveCode(result.code)
    crawlAndSave.mutate(result.code)
  }

  const handleSearch = (): void => {
    const trimmed = input.trim()
    if (trimmed === '') return

    // A direct code (RJ/VJ/ST/VN/GC) resolves the same way regardless of
    // which tab is selected - the toggle only decides which API(s) a
    // free-text title search hits.
    const code = parseCodeInput(trimmed)
    if (code) {
      searchDlsite.reset()
      searchSteam.reset()
      searchVndb.reset()
      searchGetchu.reset()
      setActiveCode(code)
      crawlAndSave.mutate(code)
      return
    }

    setActiveCode(null)
    // A new query TEXT (regardless of which tab submits it) invalidates
    // every source's previously cached results - otherwise switching tabs
    // and searching something different leaves other sources showing stale
    // results for the OLD query, composited into the "All" tab's grouped
    // view as if they were current. Re-submitting the exact same text from
    // a different tab deliberately does NOT reset - that's the existing
    // cross-tab cache behavior, preserved here.
    if (trimmed !== lastQuery) {
      searchDlsite.reset()
      searchSteam.reset()
      searchVndb.reset()
      searchGetchu.reset()
    }
    setLastQuery(trimmed)
    if (source === 'all') {
      searchDlsite.mutate(trimmed)
      searchSteam.mutate(trimmed)
      searchVndb.mutate(trimmed)
      searchGetchu.mutate(trimmed)
    } else if (source === 'dlsite') {
      searchDlsite.mutate(trimmed)
    } else if (source === 'steam') {
      searchSteam.mutate(trimmed)
    } else if (source === 'vndb') {
      searchVndb.mutate(trimmed)
    } else {
      searchGetchu.mutate(trimmed)
    }
  }

  const dlsiteHasData = searchDlsite.data !== undefined
  const steamHasData = searchSteam.data !== undefined
  const vndbHasData = searchVndb.data !== undefined
  const getchuHasData = searchGetchu.data !== undefined

  // Prefer staying on the current tab if it (or, for 'all', any of its 4
  // sources) has results; otherwise fall back to whichever single source
  // does, in a fixed order. null means nothing to go back to anywhere, so
  // the link itself should not render.
  const currentTabHasData =
    source === 'all'
      ? dlsiteHasData || steamHasData || vndbHasData || getchuHasData
      : source === 'dlsite'
        ? dlsiteHasData
        : source === 'steam'
          ? steamHasData
          : source === 'vndb'
            ? vndbHasData
            : getchuHasData
  const backTargetSource: SearchSource | null = currentTabHasData
    ? source
    : dlsiteHasData
      ? 'dlsite'
      : steamHasData
        ? 'steam'
        : vndbHasData
          ? 'vndb'
          : getchuHasData
            ? 'getchu'
            : null
  const hasBackTarget = backTargetSource !== null

  const showingResultsList = activeCode === null && activeSearch.data !== undefined

  const allNoResults =
    source === 'all' &&
    activeCode === null &&
    !searchDlsite.isPending &&
    !searchSteam.isPending &&
    !searchVndb.isPending &&
    !searchGetchu.isPending &&
    !searchDlsite.isError &&
    !searchSteam.isError &&
    !searchVndb.isError &&
    !searchGetchu.isError &&
    dlsiteHasData &&
    steamHasData &&
    vndbHasData &&
    getchuHasData &&
    searchDlsite.data!.length === 0 &&
    searchSteam.data!.length === 0 &&
    searchVndb.data!.length === 0 &&
    searchGetchu.data!.length === 0

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex w-fit gap-1 rounded-md bg-muted p-1">
        <Button
          type="button"
          variant={source === 'all' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={source === 'all'}
          onClick={() => setSource('all')}
        >
          {t('gameSearch.all')}
        </Button>
        <Button
          type="button"
          variant={source === 'dlsite' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={source === 'dlsite'}
          onClick={() => setSource('dlsite')}
        >
          DLsite
        </Button>
        <Button
          type="button"
          variant={source === 'steam' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={source === 'steam'}
          onClick={() => setSource('steam')}
        >
          Steam
        </Button>
        <Button
          type="button"
          variant={source === 'vndb' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={source === 'vndb'}
          onClick={() => setSource('vndb')}
        >
          VNDB
        </Button>
        <Button
          type="button"
          variant={source === 'getchu' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={source === 'getchu'}
          onClick={() => setSource('getchu')}
        >
          getchu
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('gameSearch.placeholder')}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button onClick={handleSearch}>{t('gameSearch.search')}</Button>
      </div>

      {activeCode && hasBackTarget && (
        <button
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => {
            if (backTargetSource !== null) setSource(backTargetSource)
            setActiveCode(null)
          }}
        >
          <ArrowLeft className="h-3 w-3" />
          {t('gameSearch.backToResults')}
        </button>
      )}

      {source === 'all' ? (
        activeCode === null && (
          <div className="flex flex-col gap-3 overflow-auto">
            {allNoResults && (
              <p className="text-sm text-muted-foreground">{t('dlsiteSearch.noResults')}</p>
            )}
            {renderSourceGroup(
              'DLsite',
              searchDlsite,
              selectResult,
              t('gameSearch.searching'),
              t('dlsiteSearch.searchError')
            )}
            {renderSourceGroup(
              'Steam',
              searchSteam,
              selectResult,
              t('gameSearch.searching'),
              t('dlsiteSearch.searchError')
            )}
            {renderSourceGroup(
              'VNDB',
              searchVndb,
              selectResult,
              t('gameSearch.searching'),
              t('dlsiteSearch.searchError')
            )}
            {renderSourceGroup(
              'getchu',
              searchGetchu,
              selectResult,
              t('gameSearch.searching'),
              t('dlsiteSearch.searchError')
            )}
          </div>
        )
      ) : (
        <>
          {activeSearch.isPending && (
            <div className="flex max-w-xs flex-col gap-1">
              <IndeterminateProgressBar />
              <p className="text-xs text-muted-foreground">{t('gameSearch.searching')}</p>
            </div>
          )}

          {activeSearch.isError && (
            <p className="text-sm text-muted-foreground">{t('dlsiteSearch.searchError')}</p>
          )}

          {showingResultsList && activeSearch.data!.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('dlsiteSearch.noResults')}</p>
          )}

          {showingResultsList && activeSearch.data!.length > 0 && (
            <div className="flex flex-col gap-1 overflow-auto">
              {activeSearch.data!.map((result) => renderResultCard(result, selectResult))}
            </div>
          )}
        </>
      )}

      {crawlAndSave.isPending && (
        <div className="flex max-w-xs flex-col gap-1">
          <IndeterminateProgressBar />
          <p className="text-xs text-muted-foreground">{t('gameSearch.fetchingInfo')}</p>
        </div>
      )}

      {activeCode && isLoading && (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      )}

      {activeCode && !isLoading && !metadata && (
        <p className="text-sm text-muted-foreground">{t('gameSearch.notFound')}</p>
      )}

      {metadata && (
        <div className="flex gap-4">
          <div className="h-56 w-40 shrink-0 overflow-hidden rounded bg-muted">
            {coverImage && (
              <img
                src={coverImage}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            )}
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <p className="text-base font-medium">{metadata.title}</p>
            <p className="text-muted-foreground">{metadata.circle}</p>
            <p className="text-muted-foreground">{metadata.releaseDate}</p>
            <p className="text-muted-foreground">{metadata.genres.join(', ')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
