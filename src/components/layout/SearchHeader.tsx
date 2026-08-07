import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'

interface SearchHeaderProps {
  query: string
  onQueryChange: (query: string) => void
  includedGenres: string[]
  excludedGenres: string[]
  onGenreFiltersChange: (includedGenres: string[], excludedGenres: string[]) => void
}

export function SearchHeader({
  query,
  onQueryChange,
  includedGenres,
  excludedGenres,
  onGenreFiltersChange,
}: SearchHeaderProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [genreInput, setGenreInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || event.key !== 'f') return

      // Ctrl+F is global (window-level) so it can be pressed while another
      // input/textarea elsewhere in the app is focused - don't steal focus
      // from whatever the user is already typing into.
      const active = document.activeElement
      const isEditingElsewhere =
        active instanceof HTMLElement &&
        active !== inputRef.current &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (isEditingElsewhere) return

      event.preventDefault()
      setExpanded(true)
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const isExpanded = expanded || query !== ''
  const hasActiveFilters = includedGenres.length > 0 || excludedGenres.length > 0

  // "-태그" excludes, plain "태그" includes - mirrors clicking a tag badge
  // (which sets it as the sole included genre), but additive here since
  // this is meant for composing several terms one at a time rather than
  // replacing the whole filter each time.
  const handleGenreInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return
    const trimmed = genreInput.trim()
    if (trimmed === '') return

    if (trimmed.startsWith('-') && trimmed.length > 1) {
      const genre = trimmed.slice(1)
      if (!excludedGenres.includes(genre)) {
        onGenreFiltersChange(
          includedGenres.filter((g) => g !== genre),
          [...excludedGenres, genre]
        )
      }
    } else if (!includedGenres.includes(trimmed)) {
      onGenreFiltersChange(
        [...includedGenres, trimmed],
        excludedGenres.filter((g) => g !== trimmed)
      )
    }
    setGenreInput('')
  }

  const removeIncluded = (genre: string): void => {
    onGenreFiltersChange(
      includedGenres.filter((g) => g !== genre),
      excludedGenres
    )
  }

  const removeExcluded = (genre: string): void => {
    onGenreFiltersChange(
      includedGenres,
      excludedGenres.filter((g) => g !== genre)
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        onFocusCapture={() => setExpanded(true)}
        onBlurCapture={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setExpanded(false)
        }}
        className={cn(
          'flex items-center gap-2 overflow-hidden rounded-md border border-border bg-background px-2 transition-[width] duration-200',
          isExpanded ? 'w-[28rem]' : 'w-8'
        )}
      >
        <button
          type="button"
          aria-label={t('search.openSearch')}
          onClick={() => {
            setExpanded(true)
            inputRef.current?.focus()
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Search className="h-4 w-4" />
        </button>
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('search.placeholder')}
          className="h-7 min-w-0 border-none p-0 shadow-none focus-visible:ring-0"
        />
        <div className="h-4 w-px shrink-0 bg-border" />
        <Input
          value={genreInput}
          onChange={(e) => setGenreInput(e.target.value)}
          onKeyDown={handleGenreInputKeyDown}
          placeholder={t('search.tagFilterPlaceholder')}
          className="h-7 min-w-0 border-none p-0 shadow-none focus-visible:ring-0"
        />
      </div>
      {includedGenres.map((genre) => (
        <span
          key={`include-${genre}`}
          className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
        >
          {genre}
          <button
            aria-label={t('search.removeIncludeFilter', { genre })}
            onClick={() => removeIncluded(genre)}
            className="hover:text-primary/70"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {excludedGenres.map((genre) => (
        <span
          key={`exclude-${genre}`}
          className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
        >
          -{genre}
          <button
            aria-label={t('search.removeExcludeFilter', { genre })}
            onClick={() => removeExcluded(genre)}
            className="hover:text-destructive/70"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={() => onGenreFiltersChange([], [])}>
          <X className="mr-1 h-3 w-3" />
          {t('search.clearFilters')}
        </Button>
      )}
    </div>
  )
}
