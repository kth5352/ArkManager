import { useState } from 'react'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { useCrawlGameMetadata, useGameMetadata } from '../../services/metadataService'
import { parseCodeInput } from './parseCodeInput'
import type { GameCode } from '../../../shared/types/scanner'

export function DlsiteSearchPage() {
  const [input, setInput] = useState('')
  const [activeCode, setActiveCode] = useState<GameCode | null>(null)

  const { data: metadata, isLoading } = useGameMetadata(activeCode)
  const crawlAndSave = useCrawlGameMetadata()

  const handleSearch = (): void => {
    const code = parseCodeInput(input)
    setActiveCode(code)
    if (code) crawlAndSave.mutate(code)
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="RJ01169914 또는 작품 제목"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button onClick={handleSearch}>검색</Button>
      </div>

      {!activeCode && input.trim() !== '' && (
        <p className="text-sm text-muted-foreground">
          제목 검색은 아직 지원하지 않습니다 — RJ/VJ 코드를 입력해 주세요.
        </p>
      )}

      {activeCode && isLoading && (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      )}

      {activeCode && !isLoading && !metadata && (
        <p className="text-sm text-muted-foreground">작품을 찾을 수 없습니다.</p>
      )}

      {metadata && (
        <div className="flex gap-4">
          <div className="h-56 w-40 shrink-0 overflow-hidden rounded bg-muted">
            {metadata.coverImagePath && (
              <img
                src={`file://${metadata.coverImagePath}`}
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
