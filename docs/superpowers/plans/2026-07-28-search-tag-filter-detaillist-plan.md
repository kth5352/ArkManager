# 검색·태그필터·DetailList Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gallery/List/DetailList/Explorer 각각에 독립적인 검색 헤더(제목/장르/서클/코드 검색 + 제외태그, Ctrl+F로 확장)를 추가하고, Gallery/List에 장르 뱃지 클릭 필터를 붙인다. 텍스트 전용 테이블 뷰 DetailList를 신설하고, Gallery 카드 그리드를 균등 정렬로 바꾼다.

**Architecture:** 검색/필터 상태는 페이지별로 독립적인 로컬 상태(각 페이지 컴포넌트 안의 `useState`)로 관리한다 — 여러 페이지가 공유할 이유가 없다고 이미 결정됨(설계 문서 참고). 장르 데이터는 `game_metadata`를 코드 목록으로 한 번에 조회하는 벌크 IPC로 가져와 N+1 호출을 피한다.

**Tech Stack:** 기존 스택 그대로.

## Global Constraints

- TypeScript strict 모드, `npm run typecheck` 에러 0개.
- ESLint + Prettier 에러/경고 0개.
- SQL 접근은 Repository 모듈을 통해서만.
- 모든 신규 파일은 상대경로 import만 사용.
- 검색/필터 상태는 페이지별 독립 — 전역 공유 스토어를 만들지 않는다.
- 이 플랜은 A그룹 플랜(`2026-07-28-dlsite-metadata-crawling-plan.md`)이 이미 구현되어 `game_metadata` 테이블에 `title`/`circle`/`genres` 컬럼과 `gameMetadataRepository.ts`가 존재한다고 가정한다. A그룹이 아직 구현되지 않았다면, 이 플랜의 장르 관련 기능(태그 뱃지, 장르 검색, DetailList의 장르 컬럼)은 항상 빈 값으로 표시된다 — 이는 버그가 아니라 크롤링 전 정상 상태다.
- 스펙 참조: `docs/superpowers/specs/2026-07-28-game-management-expansion-design.md`.

---

### Task 1: 스캐너에 `size` 필드 추가

**Files:**
- Modify: `shared/types/scanner.ts`
- Modify: `electron/main/scanner/folderScanner.ts`
- Modify: `electron/main/scanner/folderScanner.test.ts`

**Interfaces:**
- Produces: `ScannedEntry.size: number`(바이트) — Task 5(DetailList)가 소비.

- [ ] **Step 1: `shared/types/scanner.ts`의 `ScannedEntry`에 `size` 추가**

```ts
export interface ScannedEntry {
  name: string
  path: string
  kind: 'folder' | 'file'
  mtimeMs: number
  size: number // 바이트. 폴더의 경우 stat()이 보고하는 디렉터리 엔트리 자체의 크기(내용물 합산 아님)
  code: GameCode | null
}
```

- [ ] **Step 2: 기존 `folderScanner.test.ts`의 관련 단언에 `size` 필드 기대값 추가할 필요가 있는지 확인**

기존 테스트들은 대부분 `.name`/`.code`/`.kind`만 단언하므로 대부분 그대로 통과한다. `toEqual`로 전체 객체를 비교하는 테스트가 있는지 확인(현재는 없음 — 모두 `.map((e) => e.name)`이나 개별 필드 단언). 없으므로 이 스텝은 수정 없이 확인만 하고 넘어간다.

- [ ] **Step 3: `electron/main/scanner/folderScanner.ts`의 `toScannedEntry`에 `size` 추가**

```ts
async function toScannedEntry(parentPath: string, name: string): Promise<ScannedEntry | null> {
  const path = join(parentPath, name)
  try {
    const stats = await stat(path)
    return {
      name,
      path,
      kind: stats.isDirectory() ? 'folder' : 'file',
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      code: extractCode(name),
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: 실행해서 통과 확인 (기존 테스트에 새 필드가 추가돼도 깨지지 않아야 함)**

Run: `npm run test -- electron/main/scanner/folderScanner.test.ts`
Expected: PASS, 기존과 동일한 개수(8 tests).

- [ ] **Step 5: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0(다른 `ScannedEntry` 소비처가 `size`를 안 써도 구조적 타입이라 에러 나지 않음 — 단, `size`를 명시적으로 만드는 모든 객체 리터럴은 채워야 함. `electron/main/scanner/thumbnail.ts` 등은 `ScannedEntry`를 만들지 않으므로 영향 없음).

- [ ] **Step 6: Commit**

```bash
git add shared/types/scanner.ts electron/main/scanner/folderScanner.ts
git commit -m "feat: add file size to ScannedEntry for DetailList"
```

---

### Task 2: `game_metadata` 벌크 조회 IPC

**Files:**
- Modify: `electron/main/database/gameMetadataRepository.ts`
- Modify: `electron/main/database/gameMetadataRepository.test.ts`
- Modify: `shared/types/ipc.ts`
- Modify: `electron/main/ipc/metadataHandlers.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/services/metadataService.ts`

**Interfaces:**
- Produces: `getManyGameMetadata(db, codes: string[]): Map<string, GameMetadataRow>`, `window.api.metadata.getMany(codes: string[]): Promise<Record<string, GameMetadataDto>>`, `useGameMetadataMany(codes: string[])` — Task 3/4/5가 소비(장르 뱃지, 검색, DetailList 모두 화면에 보이는 항목 전체의 메타데이터를 한 번에 필요로 함 — 항목마다 개별 IPC를 부르면 N+1이 된다).

- [ ] **Step 1: `gameMetadataRepository.test.ts`에 실패하는 테스트 추가**

```ts
import { getManyGameMetadata } from './gameMetadataRepository'

it('fetches multiple codes in one call, omitting codes with no row', () => {
  saveGameMetadata(db, 'RJ01111111', {
    title: 'Game A',
    circle: 'Circle A',
    releaseDate: '2025-01-01',
    genres: ['액션'],
    coverImageUrl: null,
  })
  saveGameMetadata(db, 'RJ02222222', {
    title: 'Game B',
    circle: 'Circle B',
    releaseDate: '2025-02-02',
    genres: ['드라마'],
    coverImageUrl: null,
  })

  const result = getManyGameMetadata(db, ['RJ01111111', 'RJ02222222', 'RJ99999999'])
  expect(result.size).toBe(2)
  expect(result.get('RJ01111111')?.title).toBe('Game A')
  expect(result.has('RJ99999999')).toBe(false)
})

it('returns an empty map for an empty code list', () => {
  expect(getManyGameMetadata(db, []).size).toBe(0)
})
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `npm run test -- electron/main/database/gameMetadataRepository.test.ts`
Expected: FAIL — `getManyGameMetadata` does not exist.

- [ ] **Step 3: `gameMetadataRepository.ts`에 함수 추가**

```ts
import { inArray } from 'drizzle-orm'

export function getManyGameMetadata(db: AppDatabase, codes: string[]): Map<string, GameMetadataRow> {
  if (codes.length === 0) return new Map()

  const rows = db.select().from(gameMetadata).where(inArray(gameMetadata.code, codes)).all()
  return new Map(
    rows.map((row) => [
      row.code,
      { ...row, genres: row.genres ? (JSON.parse(row.genres) as string[]) : [] },
    ])
  )
}
```

- [ ] **Step 4: 실행해서 통과 확인**

Run: `npm run test -- electron/main/database/gameMetadataRepository.test.ts`
Expected: PASS, 7 tests(A그룹의 5개 + 이번 2개).

- [ ] **Step 5: `shared/types/ipc.ts`에 채널과 스키마 추가**

```ts
  METADATA_GET_MANY: 'metadata:get-many',
```

```ts
export const GetManyMetadataRequestSchema = z.object({
  codes: z.array(z.string()),
})
```

- [ ] **Step 6: `metadataHandlers.ts`에 핸들러 추가**

```ts
import { getManyGameMetadata } from '../database/gameMetadataRepository'
import { GetManyMetadataRequestSchema } from '../../../shared/types/ipc'

// registerMetadataHandlers 안에 추가
  ipcMain.handle(IPC_CHANNELS.METADATA_GET_MANY, (_event, payload: unknown) => {
    const { codes } = GetManyMetadataRequestSchema.parse(payload)
    const rows = getManyGameMetadata(db, codes)
    const result: Record<string, GameMetadataDto> = {}
    for (const [code, row] of rows) {
      result[code] = {
        code: row.code,
        title: row.title,
        circle: row.circle,
        releaseDate: row.releaseDate,
        genres: row.genres,
        coverImagePath: row.coverImagePath,
      }
    }
    return result
  })
```

- [ ] **Step 7: `electron/preload/index.ts`에 API 추가**

`metadata` 객체 안에 추가:

```ts
    getMany: (codes: string[]): Promise<Record<string, GameMetadataDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_GET_MANY, { codes }),
```

- [ ] **Step 8: `src/services/metadataService.ts`에 훅 추가**

```ts
export function useGameMetadataMany(codes: string[]) {
  return useQuery<Record<string, GameMetadataDto>>({
    queryKey: ['metadata-many', [...codes].sort()],
    queryFn: () => window.api.metadata.getMany(codes),
    enabled: codes.length > 0,
  })
}
```

- [ ] **Step 9: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 10: Commit**

```bash
git add electron/main/database/gameMetadataRepository.ts electron/main/database/gameMetadataRepository.test.ts shared/types/ipc.ts electron/main/ipc/metadataHandlers.ts electron/preload/index.ts src/services/metadataService.ts
git commit -m "feat: add bulk game_metadata lookup for search/tag-filter/DetailList"
```

---

### Task 3: 검색·태그필터 순수 로직 + 검색 헤더 컴포넌트

**Files:**
- Create: `src/lib/filterEntries.ts`
- Test: `src/lib/filterEntries.test.ts`
- Create: `src/components/layout/SearchHeader.tsx`

**Interfaces:**
- Produces: `filterEntries(entries, metadataByCode, query, excludedGenres): T[]`(순수 함수), `<SearchHeader>`(Ctrl+F 확장 UI) — Task 4가 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/filterEntries.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest'
import { filterEntries } from './filterEntries'

interface TestEntry {
  name: string
  code: { type: 'RJ' | 'VJ' | 'ST'; value: string } | null
}

const metadataByCode = {
  RJ01111111: { title: 'Alpha Game', circle: 'Circle One', genres: ['액션', '판타지'] },
  RJ02222222: { title: 'Beta Game', circle: 'Circle Two', genres: ['드라마'] },
}

const entries: TestEntry[] = [
  { name: 'alpha.zip', code: { type: 'RJ', value: 'RJ01111111' } },
  { name: 'beta.zip', code: { type: 'RJ', value: 'RJ02222222' } },
  { name: 'no-code-file.txt', code: null },
]

describe('filterEntries', () => {
  it('matches by file name (case-insensitive)', () => {
    expect(filterEntries(entries, metadataByCode, 'ALPHA', []).map((e) => e.name)).toEqual([
      'alpha.zip',
    ])
  })

  it('matches by crawled title', () => {
    expect(filterEntries(entries, metadataByCode, 'Beta Game', []).map((e) => e.name)).toEqual([
      'beta.zip',
    ])
  })

  it('matches by circle name', () => {
    expect(filterEntries(entries, metadataByCode, 'Circle One', []).map((e) => e.name)).toEqual([
      'alpha.zip',
    ])
  })

  it('matches by game code', () => {
    expect(filterEntries(entries, metadataByCode, 'RJ02222222', []).map((e) => e.name)).toEqual([
      'beta.zip',
    ])
  })

  it('returns everything when query is empty and no genres excluded', () => {
    expect(filterEntries(entries, metadataByCode, '', []).map((e) => e.name)).toEqual([
      'alpha.zip',
      'beta.zip',
      'no-code-file.txt',
    ])
  })

  it('excludes entries whose genres intersect the excluded-genre list', () => {
    expect(filterEntries(entries, metadataByCode, '', ['액션']).map((e) => e.name)).toEqual([
      'beta.zip',
      'no-code-file.txt',
    ])
  })

  it('never excludes code-less or metadata-less entries by genre (nothing to exclude on)', () => {
    expect(filterEntries(entries, metadataByCode, '', ['드라마']).map((e) => e.name)).toEqual([
      'alpha.zip',
      'no-code-file.txt',
    ])
  })
})
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `npm run test -- src/lib/filterEntries.test.ts`
Expected: FAIL — `filterEntries.ts` does not exist.

- [ ] **Step 3: `src/lib/filterEntries.ts` 구현**

```ts
export interface FilterableMetadata {
  title: string | null
  circle: string | null
  genres: string[]
}

export interface FilterableEntry {
  name: string
  code: { type: 'RJ' | 'VJ' | 'ST'; value: string } | null
}

export function filterEntries<T extends FilterableEntry>(
  entries: T[],
  metadataByCode: Record<string, FilterableMetadata>,
  query: string,
  excludedGenres: string[]
): T[] {
  const normalizedQuery = query.trim().toLowerCase()

  return entries.filter((entry) => {
    const metadata = entry.code ? metadataByCode[entry.code.value] : undefined

    if (excludedGenres.length > 0 && metadata) {
      const hasExcludedGenre = metadata.genres.some((genre) => excludedGenres.includes(genre))
      if (hasExcludedGenre) return false
    }

    if (normalizedQuery === '') return true

    const haystacks = [
      entry.name,
      entry.code?.value ?? '',
      metadata?.title ?? '',
      metadata?.circle ?? '',
    ]
    return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery))
  })
}
```

- [ ] **Step 4: 실행해서 통과 확인**

Run: `npm run test -- src/lib/filterEntries.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: `src/components/layout/SearchHeader.tsx` 구현**

Ctrl+F로 포커스, 텍스트가 있으면 확장 유지, 빈 상태로 blur되면 축소하는 애니메이션. 필터(제외 장르)가 걸려있을 때 "필터 해제" 버튼을 노출한다.

```tsx
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
```

- [ ] **Step 6: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/filterEntries.ts src/lib/filterEntries.test.ts src/components/layout/SearchHeader.tsx
git commit -m "feat: add search/tag-filter logic and search header component"
```

---

### Task 4: Gallery/List에 검색 헤더 + 태그 뱃지 연결

**Files:**
- Modify: `src/pages/Gallery/GalleryPage.tsx`
- Modify: `src/pages/List/ListPage.tsx`

**Interfaces:**
- Consumes: `filterEntries`/`SearchHeader`(Task 3), `useGameMetadataMany`(Task 2).

- [ ] **Step 1: `GalleryPage.tsx` 수정**

import 추가:

```ts
import { SearchHeader } from '../../components/layout/SearchHeader'
import { filterEntries } from '../../lib/filterEntries'
import { useGameMetadataMany } from '../../services/metadataService'
```

`GameCard`에 장르 뱃지 추가(클릭 시 부모의 필터 토글 콜백 호출):

```tsx
function GameCard({
  game,
  genres,
  onToggleGenreFilter,
}: {
  game: ScannedEntry
  genres: string[]
  onToggleGenreFilter: (genre: string) => void
}) {
  const { data: thumbnail } = useThumbnail(game.path, game.kind)
  const { data: userData } = useGameUserData(game)
  const toggleFavorite = useToggleFavorite()

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      transition={{ duration: 0.15 }}
      className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <button
        aria-label="즐겨찾기 토글"
        onClick={(e) => {
          e.stopPropagation()
          toggleFavorite.mutate({ entry: game, isFavorite: !(userData?.isFavorite ?? false) })
        }}
        className="absolute right-2 top-2 z-10 rounded-full bg-background/70 p-1 text-muted-foreground hover:text-foreground"
      >
        <Heart className="h-4 w-4" fill={userData?.isFavorite ? 'currentColor' : 'none'} />
      </button>
      <div className="aspect-[3/4] w-full bg-muted">
        {thumbnail && (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </div>
      <div className="shrink-0 p-2">
        <p className="truncate text-sm font-medium">{game.name}</p>
        {game.code && <p className="truncate text-xs text-muted-foreground">{game.code.value}</p>}
        {genres.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {genres.slice(0, 3).map((genre) => (
              <button
                key={genre}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleGenreFilter(genre)
                }}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
              >
                {genre}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
```

(위 컴포넌트는 D그룹 Task 4에서 만든 즐겨찾기 버전에 `genres`/`onToggleGenreFilter`만 추가한 것 — `Heart`/`useGameUserData`/`useToggleFavorite` import는 이미 있음)

`GridCellProps`/`GameCell`에 `metadataByCode`/`onToggleGenreFilter` prop 추가해 `GameCard`로 전달:

```tsx
interface GridCellProps {
  games: ScannedEntry[]
  columnCount: number
  gap: number
  metadataByCode: Record<string, { genres: string[] }>
  onToggleGenreFilter: (genre: string) => void
}

function GameCell({
  columnIndex,
  rowIndex,
  style,
  games,
  columnCount,
  gap,
  metadataByCode,
  onToggleGenreFilter,
}: CellComponentProps<GridCellProps>) {
  const index = rowIndex * columnCount + columnIndex
  const game = games[index]
  if (!game) return null
  const genres = game.code ? (metadataByCode[game.code.value]?.genres ?? []) : []
  return (
    <div style={{ ...style, padding: gap / 2 }}>
      <GameCard game={game} genres={genres} onToggleGenreFilter={onToggleGenreFilter} />
    </div>
  )
}
```

`GalleryPage` 함수 본문 — `useState`/`useSortPreference` 근처에 검색·필터 상태 추가:

```ts
  const [searchQuery, setSearchQuery] = useState('')
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)

  const toggleGenreFilter = (genre: string): void => {
    setExcludedGenres((current) =>
      current.includes(genre) ? current.filter((g) => g !== genre) : [...current, genre]
    )
  }
```

`sortedGames` 계산 앞에 필터링 단계 추가:

```ts
  const filteredGames =
    games.length > 0 ? filterEntries(games, metadataByCode, searchQuery, excludedGenres) : games
  const sortedGames =
    filteredGames.length > 0 ? sortEntries(filteredGames, sortField, sortDirection) : filteredGames
```

`<PageToolbar>` 위에 `<SearchHeader>` 추가:

```tsx
      <SearchHeader
        query={searchQuery}
        onQueryChange={setSearchQuery}
        excludedGenres={excludedGenres}
        onClearFilters={() => setExcludedGenres([])}
      />
      <PageToolbar ... />
```

`Grid`의 `cellProps`에 `metadataByCode`/`onToggleGenreFilter` 추가:

```tsx
                cellProps={{ games: sortedGames, columnCount, gap, metadataByCode, onToggleGenreFilter: toggleGenreFilter }}
```

- [ ] **Step 2: `ListPage.tsx`도 동일한 패턴으로 수정**

`GameRow`에 장르 뱃지 추가(Gallery와 동일한 방식), `ListPage` 함수 본문에 검색·필터 상태와 `filterEntries` 호출 추가, `<SearchHeader>` 렌더링 추가 — Gallery와 완전히 같은 구조이므로 세부 코드는 Step 1을 그대로 List 컴포넌트 구조에 맞춰 옮긴다(`Grid` 대신 `List`/`rowProps`를 씀).

- [ ] **Step 3: 수동 검증 (CDP 또는 실제 앱)**

Gallery/List에서 검색창에 제목 일부를 입력해 필터링되는지, Ctrl+F로 검색창이 확장되는지, 장르 뱃지를 클릭하면 그 장르가 제외되고 "필터 해제" 버튼이 나타나는지, 다시 눌러 해제되는지 확인.

- [ ] **Step 4: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 모두 exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Gallery/GalleryPage.tsx src/pages/List/ListPage.tsx
git commit -m "feat: wire search header and genre-tag filtering into Gallery/List"
```

---

### Task 5: DetailList 뷰

**Files:**
- Create: `src/pages/DetailList/DetailListPage.tsx`
- Modify: `src/router.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `useGames`(기존), `useGameMetadataMany`(Task 2), `filterEntries`/`SearchHeader`(Task 3), `sortEntries`/`useSortPreference`(기존 — `sortPreferences` 테이블의 `page` 값에 `'detail-list'`를 새로 쓴다. 기존 `SortPageSchema`가 `z.enum(['gallery','list','explorer'])`로 좁혀져 있으므로 이 스키마도 확장해야 한다).

- [ ] **Step 1: `shared/types/ipc.ts`의 `SortPageSchema`에 `'detail-list'` 추가**

```ts
export const SortPageSchema = z.enum(['gallery', 'list', 'explorer', 'detail-list'])
```

`electron/main/database/sortPreferencesRepository.ts`의 `SortPage` 타입도 동일하게 확장:

```ts
export type SortPage = 'gallery' | 'list' | 'explorer' | 'detail-list'
```

- [ ] **Step 2: `src/pages/DetailList/DetailListPage.tsx` 구현**

`react-window`의 `List`(가상화)를 재사용하되 행 높이는 List보다 작게(텍스트만이라 조밀하게), 컬럼은 코드/파일명/경로/장르/수정일/용량:

```tsx
import { List, type RowComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { useState } from 'react'
import { useGames } from '../../services/useGames'
import { useGameMetadataMany } from '../../services/metadataService'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import { filterEntries } from '../../lib/filterEntries'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { Skeleton } from '../../components/ui/skeleton'
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
}

function Row({ index, style, entries, metadataByCode }: RowComponentProps<DetailListRowProps>) {
  const entry = entries[index]
  if (!entry) return null
  const genres = entry.code ? (metadataByCode[entry.code.value]?.genres ?? []) : []

  return (
    <div
      style={style}
      className="flex items-center gap-4 border-b border-border px-4 text-xs text-muted-foreground"
    >
      <span className="w-28 shrink-0 truncate">{entry.code?.value ?? '-'}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{entry.name}</span>
      <span className="w-64 shrink-0 truncate">{entry.path}</span>
      <span className="w-40 shrink-0 truncate">{genres.join(', ')}</span>
      <span className="w-24 shrink-0">{formatDate(entry.mtimeMs)}</span>
      <span className="w-20 shrink-0">{formatSize(entry.size)}</span>
    </div>
  )
}

export function DetailListPage() {
  const { data: games, isLoading } = useGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('detail-list')
  const [searchQuery, setSearchQuery] = useState('')
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)

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
                  rowProps={{ entries: sorted, metadataByCode }}
                  rowCount={sorted.length}
                  rowHeight={ROW_HEIGHT}
                  style={{ height, width }}
                />
              )
            }}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `src/router.tsx`에 라우트 추가**

```ts
const detailListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/detail-list',
  component: DetailListPage,
})
```

`routeTree`의 `addChildren`에 추가.

- [ ] **Step 4: `src/components/layout/Sidebar.tsx`에 메뉴 추가**

`import { ... Rows3 } from 'lucide-react'`에 `Rows3` 추가:

```ts
  { to: '/detail-list', label: 'DetailList', icon: Rows3 },
```

- [ ] **Step 5: 수동 검증 (CDP 또는 실제 앱)**

DetailList 탭에서 코드/파일명/경로/장르/수정일/용량이 표 형태로 보이는지, 검색/정렬/장르필터가 Gallery와 동일하게 동작하는지 확인.

- [ ] **Step 6: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 모두 exit 0.

- [ ] **Step 7: Commit**

```bash
git add shared/types/ipc.ts electron/main/database/sortPreferencesRepository.ts src/pages/DetailList/ src/router.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: add DetailList table view"
```

---

### Task 6: Gallery 카드 균등 정렬

**Files:**
- Modify: `src/pages/Gallery/GalleryPage.tsx`

**Interfaces:** 없음 (레이아웃 계산만 변경).

**문제**: `react-window`의 `Grid`는 고정 `columnWidth`로 가상화하므로 순수 CSS `justify-content: space-around`를 적용할 수 없다(가상화 레이어가 각 셀을 절대 위치로 배치). 대신 컨테이너 폭에서 카드가 실제로 차지하는 폭을 뺀 나머지를 컬럼 간격에 균등 배분해 `columnWidth`를 늘리는 방식으로 시각적 균등 정렬 효과를 낸다.

- [ ] **Step 1: `GalleryPage.tsx`의 `columnCount`/`columnWidth` 계산 수정**

기존:

```ts
              const columnCount = Math.max(1, Math.floor(width / (cardWidth + gap)))
```

교체 — 컬럼 수를 구한 뒤, 실제 렌더링에 쓸 `columnWidth`를 남는 폭만큼 늘려 카드 사이 간격이 균등하게 넓어지도록 한다:

```ts
              const columnCount = Math.max(1, Math.floor(width / (cardWidth + gap)))
              const usedWidth = columnCount * (cardWidth + gap)
              const extraPerColumn = columnCount > 0 ? (width - usedWidth) / columnCount : 0
              const effectiveColumnWidth = cardWidth + gap + extraPerColumn
```

`Grid`의 `columnWidth={cardWidth + gap}`를 `columnWidth={effectiveColumnWidth}`로 교체. `GameCell`은 `style`(react-window가 계산한 셀 영역)에 `padding: gap / 2`를 이미 적용하고 있으므로, 컬럼폭이 넓어진 만큼 카드 좌우 여백이 자연히 커져 균등 정렬처럼 보인다 — `GameCard` 자체의 폭은 `aspect-[3/4]`/`w-full`이 부모(셀) 크기를 따라가지 않고 `CARD_WIDTH * zoom`으로 고정돼 있으므로, `GameCell`의 `div` 스타일에 `display: flex; justify-content: center`를 추가해 카드를 셀 안에서 가운데 정렬한다:

```tsx
    <div style={{ ...style, padding: gap / 2, display: 'flex', justifyContent: 'center' }}>
      <GameCard game={game} genres={genres} onToggleGenreFilter={onToggleGenreFilter} />
    </div>
```

(단, `GameCard`가 `h-full w-full`이므로 고정폭으로 만들려면 `GameCard`를 감싸는 `div`에 `style={{ width: cardWidth }}`를 추가해야 실제로 카드 폭이 늘어난 컬럼폭만큼 퍼지지 않고 원래 크기를 유지한 채 가운데 정렬된다 — 아래처럼 `GameCell`을 최종 수정)

```tsx
function GameCell({
  columnIndex,
  rowIndex,
  style,
  games,
  columnCount,
  gap,
  cardWidth,
  metadataByCode,
  onToggleGenreFilter,
}: CellComponentProps<GridCellProps>) {
  const index = rowIndex * columnCount + columnIndex
  const game = games[index]
  if (!game) return null
  const genres = game.code ? (metadataByCode[game.code.value]?.genres ?? []) : []
  return (
    <div style={{ ...style, padding: gap / 2, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: cardWidth }}>
        <GameCard game={game} genres={genres} onToggleGenreFilter={onToggleGenreFilter} />
      </div>
    </div>
  )
}
```

`GridCellProps`에 `cardWidth: number` 추가, `cellProps`에 `cardWidth` 전달.

- [ ] **Step 2: 수동 검증 (CDP 또는 실제 앱)**

Gallery에서 창 폭을 늘리거나 줄이며 카드가 좌측에 몰리지 않고 행 안에서 균등하게 퍼져 정렬되는지 확인. Ctrl+휠/줌 슬라이더로 카드 크기를 바꿔도 정렬이 유지되는지 확인.

- [ ] **Step 3: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 모두 exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Gallery/GalleryPage.tsx
git commit -m "feat: distribute Gallery cards evenly across row width"
```

---

### Task 7: 최종 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 검증 스위트 실행**

```bash
npm run lint
npm run typecheck
npm run test
npm run format:check
npm run build
```
Expected: 다섯 개 모두 exit 0.

- [ ] **Step 2: Commit** (Step 1에서 수정이 필요했을 때만)

```bash
git add -A
git commit -m "fix: address issues found in search/tag-filter/DetailList verification pass"
```

---
