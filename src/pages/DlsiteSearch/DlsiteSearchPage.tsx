import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import {
  useCrawlGameMetadata,
  useGameCoverImage,
  useGameMetadata,
  useSearchDlsite,
} from '../../services/metadataService'
import { IndeterminateProgressBar } from '../../components/ui/progress-bar'
import { parseCodeInput } from './parseCodeInput'
import { useTranslation } from '../../i18n/useTranslation'
import type { GameCode } from '../../../shared/types/scanner'
import type { DlsiteSearchResultDto } from '../../../shared/types/ipc'

export function DlsiteSearchPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [activeCode, setActiveCode] = useState<GameCode | null>(null)

  const { data: metadata, isLoading } = useGameMetadata(activeCode)
  const crawlAndSave = useCrawlGameMetadata()
  const searchDlsite = useSearchDlsite()
  const { data: coverImage } = useGameCoverImage(metadata?.coverImagePath ? activeCode : null)

  const selectResult = (result: DlsiteSearchResultDto): void => {
    setActiveCode(result.code)
    crawlAndSave.mutate(result.code)
  }

  const handleSearch = (): void => {
    const trimmed = input.trim()
    if (trimmed === '') return

    const code = parseCodeInput(trimmed)
    if (code) {
      searchDlsite.reset()
      setActiveCode(code)
      crawlAndSave.mutate(code)
      return
    }

    setActiveCode(null)
    searchDlsite.mutate(trimmed)
  }

  // Only true once a title search actually ran and hasn't been superseded -
  // selecting a result or entering a direct code moves on to the detail
  // view instead (activeCode becomes non-null), without needing to clear
  // searchDlsite's own cached data (still used by the "검색 결과로 돌아가기"
  // back link below).
  const showingResultsList = activeCode === null && searchDlsite.data !== undefined

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('dlsiteSearch.placeholder')}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button onClick={handleSearch}>{t('dlsiteSearch.search')}</Button>
      </div>

      {activeCode && searchDlsite.data !== undefined && (
        <button
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => setActiveCode(null)}
        >
          <ArrowLeft className="h-3 w-3" />
          {t('dlsiteSearch.backToResults')}
        </button>
      )}

      {searchDlsite.isPending && (
        <div className="flex max-w-xs flex-col gap-1">
          <IndeterminateProgressBar />
          <p className="text-xs text-muted-foreground">{t('dlsiteSearch.searching')}</p>
        </div>
      )}

      {searchDlsite.isError && (
        <p className="text-sm text-muted-foreground">{t('dlsiteSearch.searchError')}</p>
      )}

      {showingResultsList && searchDlsite.data!.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('dlsiteSearch.noResults')}</p>
      )}

      {showingResultsList && searchDlsite.data!.length > 0 && (
        <div className="flex flex-col gap-1 overflow-auto">
          {searchDlsite.data!.map((result) => (
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
          <p className="text-xs text-muted-foreground">{t('dlsiteSearch.fetchingInfo')}</p>
        </div>
      )}

      {activeCode && isLoading && (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      )}

      {activeCode && !isLoading && !metadata && (
        <p className="text-sm text-muted-foreground">{t('dlsiteSearch.notFound')}</p>
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
