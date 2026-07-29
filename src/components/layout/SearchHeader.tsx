import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'

interface SearchHeaderProps {
  query: string
  onQueryChange: (query: string) => void
  excludedGenres: string[]
  onClearFilters: () => void
}

export function SearchHeader({
  query,
  onQueryChange,
  excludedGenres,
  onClearFilters,
}: SearchHeaderProps) {
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key === 'f') {
        event.preventDefault()
        setExpanded(true)
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const isExpanded = expanded || query !== ''
  const hasActiveFilters = excludedGenres.length > 0

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div
        className={`flex items-center gap-2 overflow-hidden rounded-md border border-border bg-background px-2 transition-[width] duration-200 ${
          isExpanded ? 'w-64' : 'w-8'
        }`}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setExpanded(true)}
          onBlur={() => setExpanded(false)}
          placeholder="제목, 장르, 서클명, 코드로 검색"
          className="h-7 border-none p-0 shadow-none focus-visible:ring-0"
        />
      </div>
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters}>
          <X className="mr-1 h-3 w-3" />
          필터 해제
        </Button>
      )}
    </div>
  )
}
