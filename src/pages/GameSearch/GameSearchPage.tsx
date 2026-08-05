import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import {
  useCrawlGameMetadata,
  useGameCoverImage,
  useGameMetadata,
  useSearchDlsite,
  useSearchVndb,
} from '../../services/metadataService'
import { IndeterminateProgressBar } from '../../components/ui/progress-bar'
import { parseCodeInput } from '../DlsiteSearch/parseCodeInput'
import { useTranslation } from '../../i18n/useTranslation'
import type { GameCode } from '../../../shared/types/scanner'
import type { DlsiteSearchResultDto, VndbSearchResultDto } from '../../../shared/types/ipc'

type SearchSource = 'dlsite' | 'vndb'
type SearchResult = DlsiteSearchResultDto | VndbSearchResultDto

export function GameSearchPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [source, setSource] = useState<SearchSource>('dlsite')
  const [activeCode, setActiveCode] = useState<GameCode | null>(null)

  const { data: metadata, isLoading } = useGameMetadata(activeCode)
  const crawlAndSave = useCrawlGameMetadata()
  const searchDlsite = useSearchDlsite()
  const searchVndb = useSearchVndb()
  const { data: coverImage } = useGameCoverImage(metadata?.coverImagePath ? activeCode : null)

  // Both mutations stay mounted (hooks can't be conditional) - only the one
  // matching the current toggle drives the UI below. Switching tabs
  // deliberately does not clear the other's data: returning to a
  // previously-searched tab shows its own last results again, like a cache,
  // instead of forcing a re-search.
  const activeSearch = source === 'dlsite' ? searchDlsite : searchVndb

  const selectResult = (result: SearchResult): void => {
    setActiveCode(result.code)
    crawlAndSave.mutate(result.code)
  }

  const handleSearch = (): void => {
    const trimmed = input.trim()
    if (trimmed === '') return

    // A direct code (RJ/VJ/ST/VN) resolves the same way regardless of which
    // tab is selected - the toggle only decides which API a free-text title
    // search hits.
    const code = parseCodeInput(trimmed)
    if (code) {
      searchDlsite.reset()
      searchVndb.reset()
      setActiveCode(code)
      crawlAndSave.mutate(code)
      return
    }

    setActiveCode(null)
    if (source === 'dlsite') {
      searchDlsite.mutate(trimmed)
    } else {
      searchVndb.mutate(trimmed)
    }
  }

  const hasAnyResults = searchDlsite.data !== undefined || searchVndb.data !== undefined
  const showingResultsList = activeCode === null && activeSearch.data !== undefined

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex w-fit gap-1 rounded-md bg-muted p-1">
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
          variant={source === 'vndb' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={source === 'vndb'}
          onClick={() => setSource('vndb')}
        >
          VNDB
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

      {activeCode && hasAnyResults && (
        <button
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => setActiveCode(null)}
        >
          <ArrowLeft className="h-3 w-3" />
          {t('gameSearch.backToResults')}
        </button>
      )}

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
          {activeSearch.data!.map((result) => (
            <button
              key={result.code.value}
              onClick={() => selectResult(result)}
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
          ))}
        </div>
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
