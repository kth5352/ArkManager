# 즐겨찾기·평점/메모·코드없는 파일 노출 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `game_user_data`에 즐겨찾기/평점/메모 컬럼을 추가하고 Gallery/List/Explorer에서 편집할 수 있게 한다. 동시에 `scanLibraryRecursive`의 반환 타입을 `GameEntry`(code non-null 보장)에서 `ScannedEntry`(code nullable)로 되돌려 코드없는 파일도 Gallery/List에 노출한다.

**Architecture:** 코드가 있으면 `game_user_data`의 키로 코드값을, 없으면 `librariesRepository.ts`의 기존 `normalizeLibraryPath`를 재사용해 정규화된 경로를 쓴다. 키 도출은 IPC 핸들러(main 프로세스)에서만 하고, 렌더러는 항상 `{ code, path }`를 함께 보낸다 — 정규화 로직이 프로세스 경계를 넘어 중복되지 않도록.

**Tech Stack:** 기존 스택 그대로 (Drizzle, React Query, shadcn Dialog)

## Global Constraints

- TypeScript strict 모드, `npm run typecheck` 에러 0개.
- ESLint + Prettier 에러/경고 0개.
- SQL 접근은 Repository 모듈을 통해서만.
- 모든 신규 파일은 상대경로 import만 사용.
- 선행 플랜(`2026-07-28-game-metadata-foundation-plan.md`)이 이미 구현되어 `game_user_data` 테이블과 `getGameUserData`/`touchGameUserData`/`rekeyToCode`가 존재한다고 가정한다.
- 이 플랜의 Task 3(타입 계약 변경)은 이미 승인된 `GameEntry` 타입 계약을 깨는 작업이므로, 다른 태스크와 섞지 않고 독립된 태스크로 진행하며 기존 스캐너 테스트를 모두 다시 확인한다.
- 스펙 참조: `docs/superpowers/specs/2026-07-28-game-management-expansion-design.md`.

---

### Task 1: `game_user_data`에 즐겨찾기/평점/메모 컬럼 추가

**Files:**
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/client.ts`
- Modify: `electron/main/database/gameUserDataRepository.ts`
- Modify: `electron/main/database/gameUserDataRepository.test.ts`

**Interfaces:**
- Produces: `setFavorite(db, key, keyType, isFavorite)`, `setRatingAndMemo(db, key, keyType, rating, memo)` — Task 2(IPC)가 소비. `GameUserDataRow`에 `isFavorite`/`rating`/`memo` 필드 추가.

- [ ] **Step 1: `electron/main/database/schema.ts`의 `gameUserData`에 컬럼 추가**

```ts
export const gameUserData = sqliteTable('game_user_data', {
  key: text('key').primaryKey(),
  keyType: text('key_type').notNull(),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
  rating: integer('rating'), // 1-5, null이면 미평가
  memo: text('memo'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
```

- [ ] **Step 2: `electron/main/database/client.ts`의 `game_user_data` 생성 구문에 컬럼 추가**

```ts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS game_user_data (
      key TEXT PRIMARY KEY,
      key_type TEXT NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      rating INTEGER,
      memo TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
```

- [ ] **Step 3: `gameUserDataRepository.test.ts`에 실패하는 테스트 추가**

기존 5개 테스트 뒤에 추가(`setFavorite`/`setRatingAndMemo`를 import에 추가):

```ts
it('defaults isFavorite to false and rating/memo to null on first touch', () => {
  touchGameUserData(db, 'RJ01234567', 'code')
  const row = getGameUserData(db, 'RJ01234567')
  expect(row?.isFavorite).toBe(false)
  expect(row?.rating).toBeNull()
  expect(row?.memo).toBeNull()
})

it('sets favorite independently of rating/memo', () => {
  touchGameUserData(db, 'RJ01234567', 'code')
  setFavorite(db, 'RJ01234567', 'code', true)

  const row = getGameUserData(db, 'RJ01234567')
  expect(row?.isFavorite).toBe(true)
  expect(row?.rating).toBeNull()
})

it('sets rating and memo together, and creates the row if it does not exist yet', () => {
  setRatingAndMemo(db, 'RJ01234567', 'code', 5, '최고의 게임')

  const row = getGameUserData(db, 'RJ01234567')
  expect(row?.rating).toBe(5)
  expect(row?.memo).toBe('최고의 게임')
  expect(row?.isFavorite).toBe(false)
})

it('setFavorite creates a path-keyed row if it does not exist yet', () => {
  setFavorite(db, 'd:\\games\\some-folder', 'path', true)
  expect(getGameUserData(db, 'd:\\games\\some-folder')?.isFavorite).toBe(true)
})
```

- [ ] **Step 4: 실행해서 실패 확인**

Run: `npm run test -- electron/main/database/gameUserDataRepository.test.ts`
Expected: FAIL — `setFavorite`/`setRatingAndMemo` does not exist, `getGameUserData`가 아직 새 필드를 반환하지 않음.

- [ ] **Step 5: `gameUserDataRepository.ts` 확장**

`GameUserDataRow`와 `getGameUserData`를 교체하고 새 함수 두 개 추가:

```ts
export interface GameUserDataRow {
  key: string
  keyType: GameUserDataKeyType
  isFavorite: boolean
  rating: number | null
  memo: string | null
  createdAt: string
  updatedAt: string
}

export function getGameUserData(db: AppDatabase, key: string): GameUserDataRow | undefined {
  const row = db.select().from(gameUserData).where(eq(gameUserData.key, key)).get()
  if (!row) return undefined
  return { ...row, keyType: row.keyType as GameUserDataKeyType }
}

export function setFavorite(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType,
  isFavorite: boolean
): void {
  const now = new Date().toISOString()
  db.insert(gameUserData)
    .values({ key, keyType, isFavorite, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameUserData.key, set: { isFavorite, updatedAt: now } })
    .run()
}

export function setRatingAndMemo(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType,
  rating: number | null,
  memo: string | null
): void {
  const now = new Date().toISOString()
  db.insert(gameUserData)
    .values({ key, keyType, rating, memo, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameUserData.key, set: { rating, memo, updatedAt: now } })
    .run()
}
```

`touchGameUserData`와 `rekeyToCode`는 그대로 둔다(변경 없음) — 단, `rekeyToCode`가 내부적으로 새 컬럼도 함께 옮기는지 확인 필요: 기존 구현은 `tx.insert(gameUserData).values({ key: newCode, keyType: 'code', createdAt: existing.createdAt, updatedAt: ... })`로 `isFavorite`/`rating`/`memo`를 명시하지 않으므로 스키마의 `default(false)`/`null` 기본값으로 초기화되어 **기존 즐겨찾기/평점/메모가 유실된다.** 이 버그를 여기서 함께 고친다:

```ts
export function rekeyToCode(db: AppDatabase, oldPathKey: string, newCode: string): void {
  const existing = getGameUserData(db, oldPathKey)
  if (!existing || existing.keyType !== 'path') return

  db.transaction((tx) => {
    tx.delete(gameUserData).where(eq(gameUserData.key, oldPathKey)).run()
    tx.insert(gameUserData)
      .values({
        key: newCode,
        keyType: 'code',
        isFavorite: existing.isFavorite,
        rating: existing.rating,
        memo: existing.memo,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: gameUserData.key,
        set: { updatedAt: new Date().toISOString() },
      })
      .run()
  })
}
```

- [ ] **Step 6: 재키잉이 즐겨찾기/평점/메모를 보존하는지 검증하는 테스트 추가**

기존 "rekeys a path-keyed row to a code" 테스트를 찾아 아래 내용으로 보강(같은 파일):

```ts
it('rekeying preserves isFavorite/rating/memo, not just createdAt', () => {
  setFavorite(db, 'd:\\games\\some-folder', 'path', true)
  setRatingAndMemo(db, 'd:\\games\\some-folder', 'path', 4, '괜찮음')

  rekeyToCode(db, 'd:\\games\\some-folder', 'RJ08888888')

  const after = getGameUserData(db, 'RJ08888888')
  expect(after?.isFavorite).toBe(true)
  expect(after?.rating).toBe(4)
  expect(after?.memo).toBe('괜찮음')
})
```

- [ ] **Step 7: 실행해서 통과 확인**

Run: `npm run test -- electron/main/database/gameUserDataRepository.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 8: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 9: Commit**

```bash
git add electron/main/database/schema.ts electron/main/database/client.ts electron/main/database/gameUserDataRepository.ts electron/main/database/gameUserDataRepository.test.ts
git commit -m "feat: add favorite/rating/memo columns, fix rekeyToCode data loss"
```

---

### Task 2: 즐겨찾기/평점/메모 IPC 핸들러

**Files:**
- Modify: `shared/types/ipc.ts`
- Create: `electron/main/ipc/gameUserDataHandlers.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Consumes: `setFavorite`/`setRatingAndMemo`/`getGameUserData`(Task 1), `normalizeLibraryPath`(`electron/main/database/librariesRepository.ts`, 이미 존재).
- Produces: `window.api.gameUserData.get(code, path): Promise<GameUserDataDto | null>`, `window.api.gameUserData.setFavorite(code, path, isFavorite): Promise<void>`, `window.api.gameUserData.setRatingAndMemo(code, path, rating, memo): Promise<void>` — Task 4/5가 소비.

- [ ] **Step 1: `shared/types/ipc.ts`에 채널과 스키마 추가**

`IPC_CHANNELS`에 추가:

```ts
  GAME_USER_DATA_GET: 'game-user-data:get',
  GAME_USER_DATA_SET_FAVORITE: 'game-user-data:set-favorite',
  GAME_USER_DATA_SET_RATING_AND_MEMO: 'game-user-data:set-rating-and-memo',
```

파일 끝에 추가(이미 존재하는 `GameCodeSchema`를 재사용):

```ts
// 렌더러는 항상 code와 path를 함께 보낸다 - 실제 키 도출(코드 있으면 코드,
// 없으면 경로 정규화)은 정규화 로직이 이미 있는 main 프로세스에서만 한다.
export const GameEntryIdentifierSchema = z.object({
  code: GameCodeSchema.nullable(),
  path: z.string(),
})

export const SetFavoriteRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  isFavorite: z.boolean(),
})
export type SetFavoriteRequest = z.infer<typeof SetFavoriteRequestSchema>

export const SetRatingAndMemoRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  rating: z.number().min(1).max(5).nullable(),
  memo: z.string().nullable(),
})
export type SetRatingAndMemoRequest = z.infer<typeof SetRatingAndMemoRequestSchema>

export const GetGameUserDataRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
})
export type GetGameUserDataRequest = z.infer<typeof GetGameUserDataRequestSchema>

export interface GameUserDataDto {
  isFavorite: boolean
  rating: number | null
  memo: string | null
}
```

- [ ] **Step 2: `electron/main/ipc/resolveGameEntryKey.ts` 생성**

`{code, path}` 식별자에서 `game_user_data`/`game_metadata` 조회용 키를 도출하는 로직 — B그룹(실행/세이브) IPC 핸들러도 그대로 재사용하므로 공유 모듈로 뽑는다:

```ts
import { normalizeLibraryPath } from '../database/librariesRepository'

export interface GameEntryIdentifier {
  code: { value: string } | null
  path: string
}

export function resolveGameEntryKey(identifier: GameEntryIdentifier): {
  key: string
  keyType: 'code' | 'path'
} {
  if (identifier.code) return { key: identifier.code.value, keyType: 'code' }
  return { key: normalizeLibraryPath(identifier.path), keyType: 'path' }
}
```

- [ ] **Step 3: `electron/main/ipc/gameUserDataHandlers.ts` 생성**

```ts
import { ipcMain } from 'electron'
import {
  GetGameUserDataRequestSchema,
  IPC_CHANNELS,
  SetFavoriteRequestSchema,
  SetRatingAndMemoRequestSchema,
  type GameUserDataDto,
} from '../../../shared/types/ipc'
import { getGameUserData, setFavorite, setRatingAndMemo } from '../database/gameUserDataRepository'
import { resolveGameEntryKey } from './resolveGameEntryKey'
import type { AppDatabase } from '../database/client'

function toDto(row: ReturnType<typeof getGameUserData>): GameUserDataDto | null {
  if (!row) return null
  return { isFavorite: row.isFavorite, rating: row.rating, memo: row.memo }
}

export function registerGameUserDataHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_GET, (_event, payload: unknown) => {
    const { identifier } = GetGameUserDataRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)
    return toDto(getGameUserData(db, key))
  })

  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_SET_FAVORITE, (_event, payload: unknown) => {
    const { identifier, isFavorite } = SetFavoriteRequestSchema.parse(payload)
    const { key, keyType } = resolveGameEntryKey(identifier)
    setFavorite(db, key, keyType, isFavorite)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_SET_RATING_AND_MEMO, (_event, payload: unknown) => {
    const { identifier, rating, memo } = SetRatingAndMemoRequestSchema.parse(payload)
    const { key, keyType } = resolveGameEntryKey(identifier)
    setRatingAndMemo(db, key, keyType, rating, memo)
  })
}
```

- [ ] **Step 4: `electron/main/index.ts`에 핸들러 등록**

`import { registerGameUserDataHandlers } from './ipc/gameUserDataHandlers'` 추가, `app.whenReady().then(...)` 안에서 기존 등록 호출들 옆에 `registerGameUserDataHandlers(db)` 추가.

- [ ] **Step 5: `electron/preload/index.ts`에 API 노출**

`api` 객체에 추가:

```ts
  gameUserData: {
    get: (code: GameCode | null, path: string): Promise<GameUserDataDto | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_GET, { identifier: { code, path } }),
    setFavorite: (code: GameCode | null, path: string, isFavorite: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_SET_FAVORITE, {
        identifier: { code, path },
        isFavorite,
      }),
    setRatingAndMemo: (
      code: GameCode | null,
      path: string,
      rating: number | null,
      memo: string | null
    ): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_SET_RATING_AND_MEMO, {
        identifier: { code, path },
        rating,
        memo,
      }),
  },
```

`import type { ... GameUserDataDto } from '../../shared/types/ipc'`를 기존 타입 import에 추가.

- [ ] **Step 6: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 7: Commit**

```bash
git add shared/types/ipc.ts electron/main/ipc/resolveGameEntryKey.ts electron/main/ipc/gameUserDataHandlers.ts electron/main/index.ts electron/preload/index.ts
git commit -m "feat: add game user data (favorite/rating/memo) IPC handlers"
```

---

### Task 3: 스캐너 타입 계약 변경 — `GameEntry` 폐기

**Files:**
- Modify: `shared/types/scanner.ts`
- Modify: `electron/main/scanner/folderScanner.ts`
- Modify: `electron/main/scanner/folderScanner.test.ts`
- Modify: `electron/main/ipc/scannerHandlers.ts`
- Modify: `src/services/useGames.ts`

**Interfaces:**
- Produces: `scanLibraryRecursive(libraryPath): Promise<ScannedEntry[]>`(코드 유무와 무관하게 모든 파일 포함, 코드없는 폴더는 계속 재귀 진입) — Task 4가 소비.

**이 태스크는 이미 리뷰·승인된 타입 계약을 바꾸는 작업이다.** 다른 태스크와 절대 섞지 말고, 완료 후 기존 스캐너 테스트가 전부 새 동작을 반영해 통과하는지 각별히 확인한다.

- [ ] **Step 1: `shared/types/scanner.ts`에서 `GameEntry` 제거**

```ts
export type GameCodeType = 'RJ' | 'VJ' | 'ST'

export interface GameCode {
  type: GameCodeType
  value: string // full matched code, prefix included and uppercased, e.g. "RJ01234567" or "ST4282500"
}

export interface ScannedEntry {
  name: string // file/folder name as-is, extension included, no reformatting
  path: string
  kind: 'folder' | 'file'
  mtimeMs: number
  code: GameCode | null
}
```

(`GameEntry` 인터페이스와 그 설명 주석을 통째로 삭제)

- [ ] **Step 2: `folderScanner.test.ts`의 기존 실패할 테스트를 새 동작에 맞게 수정**

`describe('scanLibraryRecursive', ...)` 블록에서 "excludes entries without a recognized code" 테스트를 찾아 교체:

```ts
it('includes code-less files alongside coded ones (no longer excluded)', async () => {
  await mkdir(join(dir, 'plain-folder'))
  await writeFile(join(dir, 'plain-folder', 'memo.txt'), '')
  await writeFile(join(dir, 'RJ01111.zip'), '')

  const entries = await scanLibraryRecursive(dir)
  const names = entries.map((e) => e.name).sort()
  expect(names).toEqual(['RJ01111.zip', 'memo.txt'])
  expect(entries.find((e) => e.name === 'memo.txt')?.code).toBeNull()
  expect(entries.find((e) => e.name === 'RJ01111.zip')?.code).toEqual({
    type: 'RJ',
    value: 'RJ01111',
  })
})
```

다른 기존 테스트들(깊이 중첩된 코드 항목 찾기, 여러 브랜치, 코드있는 폴더는 리프로 취급, 심볼릭링크 스킵, 형제 브랜치 격리)은 코드있는 항목의 동작을 검증하는 것이라 그대로 둔다 — 코드없는 파일이 이제 결과에 포함된다는 사실과 충돌하지 않는다.

- [ ] **Step 3: 실행해서 실패 확인**

Run: `npm run test -- electron/main/scanner/folderScanner.test.ts`
Expected: FAIL — `scanLibraryRecursive`가 아직 `entry.kind === 'file' && !entry.code`를 버리고 있어 `memo.txt`가 결과에 없음. 다른 파일들의 `GameEntry` 타입 참조도 컴파일 에러.

- [ ] **Step 4: `electron/main/scanner/folderScanner.ts` 수정**

```ts
import { lstat, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ScannedEntry } from '../../../shared/types/scanner'
import { extractCode } from './codeRecognition'

async function toScannedEntry(parentPath: string, name: string): Promise<ScannedEntry | null> {
  const path = join(parentPath, name)
  try {
    const stats = await stat(path)
    return {
      name,
      path,
      kind: stats.isDirectory() ? 'folder' : 'file',
      mtimeMs: stats.mtimeMs,
      code: extractCode(name),
    }
  } catch {
    return null
  }
}

function isScannedEntry(entry: ScannedEntry | null): entry is ScannedEntry {
  return entry !== null
}

async function isSymbolicLink(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path)
    return stats.isSymbolicLink()
  } catch {
    return false
  }
}

export async function scanFolderShallow(dirPath: string): Promise<ScannedEntry[]> {
  const names = await readdir(dirPath)
  const entries = await Promise.all(names.map((name) => toScannedEntry(dirPath, name)))
  return entries.filter(isScannedEntry)
}

// Gallery/List: recursively walks the entire library tree. Coded entries
// (file or folder) are leaves - matched, not walked further. Code-less
// files are now included too (code: null) rather than dropped, per the
// 코드없는 파일 노출 decision. Code-less folders are still walked into,
// looking for coded/uncoded descendants at any depth.
export async function scanLibraryRecursive(libraryPath: string): Promise<ScannedEntry[]> {
  const names = await readdir(libraryPath)
  const results: ScannedEntry[] = []

  for (const name of names) {
    const entry = await toScannedEntry(libraryPath, name)
    if (!entry) continue

    if (entry.code) {
      results.push(entry)
      continue
    }

    if (entry.kind === 'file') {
      results.push(entry)
      continue
    }

    if (await isSymbolicLink(entry.path)) continue

    try {
      const nested = await scanLibraryRecursive(entry.path)
      results.push(...nested)
    } catch {
      continue
    }
  }

  return results
}
```

- [ ] **Step 5: `electron/main/ipc/scannerHandlers.ts`의 타입 참조 수정**

`import type { GameEntry } from '../../../shared/types/scanner'`를 제거(더 이상 쓰지 않음). `SCANNER_SCAN_RECURSIVE` 핸들러 안의 `.map(async (libraryPath): Promise<GameEntry[]> => {`를 `.map(async (libraryPath): Promise<ScannedEntry[]> => {`로 바꾸고, 파일 상단에 `import type { ScannedEntry } from '../../../shared/types/scanner'`를 추가.

- [ ] **Step 6: `src/services/useGames.ts`의 타입 참조 수정**

```ts
import { useQuery } from '@tanstack/react-query'
import { useLibraries } from './librariesService'
import type { ScannedEntry } from '../../shared/types/scanner'

export function useGames() {
  const { data: libraries } = useLibraries()
  const libraryPaths = libraries?.map((lib) => lib.path) ?? []

  return useQuery<ScannedEntry[]>({
    queryKey: ['games', 'scan', libraryPaths],
    queryFn: () => window.api.scanner.scanRecursive(libraryPaths),
    enabled: libraries !== undefined,
    staleTime: 5 * 60_000,
  })
}
```

(`staleTime`은 이미 이전 검증 단계에서 추가된 것 — 그대로 유지, 타입만 변경)

- [ ] **Step 7: 실행해서 통과 확인**

Run: `npm run test -- electron/main/scanner/folderScanner.test.ts`
Expected: PASS, 8 tests(코드있는 항목 시나리오 7개는 그대로, 새로 바꾼 1개 포함).

Run: `npm run test`
Expected: 전체 스위트 통과(Gallery/List 컴포넌트는 Task 4에서 고침 — 이 시점엔 아직 타입 에러가 남아있을 수 있으므로 Step 8에서 typecheck로 확인).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: `GalleryPage.tsx`/`ListPage.tsx`가 여전히 `GameEntry`를 import하고 있어 에러 발생 — Task 4에서 고친다. 이 태스크는 여기까지 커밋하지 않고 Task 4로 이어서 진행한다(둘을 한 커밋에 묶지 않으면 중간에 타입 에러가 있는 상태로 커밋하게 되므로, 아래처럼 하나의 커밋으로 묶는다).

**주의**: Task 3과 Task 4는 타입 계약 변경이 Gallery/List 양쪽에 걸쳐 있어 분리 커밋하면 중간 상태가 컴파일되지 않는다. Task 3의 Step 1~7을 마친 뒤 커밋하지 말고 바로 Task 4로 진행해 하나의 커밋으로 묶는다.

---

### Task 4: Gallery/List가 코드없는 항목을 표시하도록 수정 + 즐겨찾기 토글

**Files:**
- Modify: `src/pages/Gallery/GalleryPage.tsx`
- Modify: `src/pages/List/ListPage.tsx`
- Create: `src/services/gameUserDataService.ts`

**Interfaces:**
- Consumes: `window.api.gameUserData.get`/`setFavorite`(Task 2), `ScannedEntry`(Task 3).
- Produces: `useGameUserData(entry: ScannedEntry)`, `useToggleFavorite()` — Task 5(평점/메모 다이얼로그)도 재사용.

- [ ] **Step 1: `src/services/gameUserDataService.ts` 생성**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'
import type { GameUserDataDto } from '../../shared/types/ipc'

function identifierKey(entry: Pick<ScannedEntry, 'code' | 'path'>): string {
  return entry.code ? entry.code.value : entry.path
}

function userDataQueryKey(entry: Pick<ScannedEntry, 'code' | 'path'>) {
  return ['game-user-data', identifierKey(entry)] as const
}

export function useGameUserData(entry: Pick<ScannedEntry, 'code' | 'path'>) {
  return useQuery<GameUserDataDto | null>({
    queryKey: userDataQueryKey(entry),
    queryFn: () => window.api.gameUserData.get(entry.code, entry.path),
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      entry,
      isFavorite,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      isFavorite: boolean
    }) => window.api.gameUserData.setFavorite(entry.code, entry.path, isFavorite),
    onSuccess: (_result, { entry, isFavorite }) => {
      queryClient.setQueryData<GameUserDataDto | null>(userDataQueryKey(entry), (prev) => ({
        isFavorite,
        rating: prev?.rating ?? null,
        memo: prev?.memo ?? null,
      }))
    },
  })
}

export function useSetRatingAndMemo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      entry,
      rating,
      memo,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      rating: number | null
      memo: string | null
    }) => window.api.gameUserData.setRatingAndMemo(entry.code, entry.path, rating, memo),
    onSuccess: (_result, { entry, rating, memo }) => {
      queryClient.setQueryData<GameUserDataDto | null>(userDataQueryKey(entry), (prev) => ({
        isFavorite: prev?.isFavorite ?? false,
        rating,
        memo,
      }))
    },
  })
}
```

- [ ] **Step 2: `src/pages/Gallery/GalleryPage.tsx` 수정**

`import type { GameEntry }`를 `import type { ScannedEntry }`로 바꾸고, `useGameUserData`/`useToggleFavorite` import 추가. `GameCard`를 교체:

```tsx
import { Heart } from 'lucide-react'
import { useGameUserData, useToggleFavorite } from '../../services/gameUserDataService'

function GameCard({ game }: { game: ScannedEntry }) {
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
        <Heart
          className="h-4 w-4"
          fill={userData?.isFavorite ? 'currentColor' : 'none'}
        />
      </button>
      <div className="aspect-[3/4] w-full bg-muted">
        {thumbnail && (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </div>
      <div className="shrink-0 p-2">
        <p className="truncate text-sm font-medium">{game.name}</p>
        {game.code && <p className="truncate text-xs text-muted-foreground">{game.code.value}</p>}
      </div>
    </motion.div>
  )
}
```

`GridCellProps`/`GameCell`의 `games: GameEntry[]`도 `games: ScannedEntry[]`로 바꾼다. `GalleryPage` 함수 본문의 `const { data: games, isLoading } = useGames()` 이하는 타입 추론이라 코드 변경 불필요.

- [ ] **Step 3: `src/pages/List/ListPage.tsx` 수정**

`import type { GameEntry }`를 `import type { ScannedEntry }`로 바꾸고, `useGameUserData`/`useToggleFavorite` import 추가. `GameRow`를 교체:

```tsx
import { Heart } from 'lucide-react'
import { useGameUserData, useToggleFavorite } from '../../services/gameUserDataService'

function GameRow({ game }: { game: ScannedEntry }) {
  const { data: thumbnail } = useThumbnail(game.path, game.kind)
  const { data: userData } = useGameUserData(game)
  const toggleFavorite = useToggleFavorite()
  const openExternal = useOpenExternal()

  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-2 transition-colors hover:bg-accent">
      <button
        aria-label="즐겨찾기 토글"
        onClick={() => toggleFavorite.mutate({ entry: game, isFavorite: !(userData?.isFavorite ?? false) })}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <Heart className="h-4 w-4" fill={userData?.isFavorite ? 'currentColor' : 'none'} />
      </button>
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
        {thumbnail && (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{game.name}</p>
        {game.code ? (
          <button
            className="truncate text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => game.code && openExternal.mutate(game.code)}
          >
            {game.code.value}
          </button>
        ) : (
          <p className="truncate text-xs text-muted-foreground">코드없음</p>
        )}
      </div>
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {formatMtime(game.mtimeMs)}
      </span>
    </div>
  )
}
```

`ListRowProps`의 `games: GameEntry[]`도 `games: ScannedEntry[]`로 바꾼다.

- [ ] **Step 4: 수동 검증 (CDP 또는 실제 앱)**

앱을 부팅해 Gallery/List에서 코드없는 파일이 이름만 표시된 채(코드 줄 없이) 함께 보이는지 확인. 카드/행의 하트 아이콘을 클릭해 즐겨찾기가 토글되고, 앱을 재시작해도 상태가 유지되는지 확인.

- [ ] **Step 5: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 모두 exit 0.

- [ ] **Step 6: Commit (Task 3 + Task 4 통합 커밋)**

```bash
git add shared/types/scanner.ts electron/main/scanner/folderScanner.ts electron/main/scanner/folderScanner.test.ts electron/main/ipc/scannerHandlers.ts src/services/useGames.ts src/pages/Gallery/GalleryPage.tsx src/pages/List/ListPage.tsx src/services/gameUserDataService.ts
git commit -m "feat: show code-less files in Gallery/List, add favorite toggle

Retires the GameEntry type (non-null code guarantee) in favor of
ScannedEntry (nullable code) so files without a recognized RJ/VJ/ST
code are no longer silently excluded from Gallery/List."
```

---

### Task 5: 평점/메모 편집 다이얼로그

**Files:**
- Create: `src/components/game/RatingMemoDialog.tsx`
- Modify: `src/pages/Explorer/DetailOverlay.tsx`

**Interfaces:**
- Consumes: `useGameUserData`/`useSetRatingAndMemo`(Task 4).

**범위**: 평점/메모 편집은 이번 태스크에서 `DetailOverlay`(Explorer에서 코드있는 항목 클릭 시 뜨는 다이얼로그)에만 연결한다. Gallery/List 카드·행에서 직접 여는 진입점은 만들지 않는다 — 이미 즐겨찾기 하트 아이콘으로 카드가 붐비기 시작했고, 평점/메모는 우클릭 메뉴(Explorer에 이미 "평점 설정"/"메모 설정" 스텁이 있음)를 통해 여는 것이 이 프로젝트의 기존 컨텍스트 메뉴 설계와 더 맞는다.

- [ ] **Step 1: `src/components/game/RatingMemoDialog.tsx` 구현**

```tsx
import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { useGameUserData, useSetRatingAndMemo } from '../../services/gameUserDataService'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface RatingMemoDialogProps {
  entry: ScannedEntry | null
  onClose: () => void
}

export function RatingMemoDialog({ entry, onClose }: RatingMemoDialogProps) {
  const { data: userData } = useGameUserData(entry ?? { code: null, path: '' })
  const setRatingAndMemo = useSetRatingAndMemo()

  const [rating, setRating] = useState<number | null>(null)
  const [memo, setMemo] = useState('')

  useEffect(() => {
    setRating(userData?.rating ?? null)
    setMemo(userData?.memo ?? '')
  }, [userData, entry])

  const handleSave = (): void => {
    if (!entry) return
    setRatingAndMemo.mutate({ entry, rating, memo: memo.trim() === '' ? null : memo })
    onClose()
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>평점 / 메모 {entry ? `- ${entry.name}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button key={value} onClick={() => setRating(value === rating ? null : value)}>
              <Star
                className="h-6 w-6 text-yellow-500"
                fill={rating !== null && value <= rating ? 'currentColor' : 'none'}
              />
            </button>
          ))}
        </div>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="메모"
          className="min-h-24 w-full rounded-md border border-border bg-background p-2 text-sm"
        />
        <Button onClick={handleSave}>저장</Button>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: `src/pages/Explorer/DetailOverlay.tsx`에 진입점 연결**

`import { useState } from 'react'`와 `import { RatingMemoDialog } from '../../components/game/RatingMemoDialog'` 추가. `DetailOverlay` 함수 안에 상태와 버튼을 추가:

```tsx
  const [editingRating, setEditingRating] = useState(false)
```

기존 "실행" 버튼 옆에 버튼 추가:

```tsx
              <Button variant="secondary" onClick={() => setEditingRating(true)}>
                평점/메모
              </Button>
```

`DialogContent` 바깥, `Dialog` 태그가 끝나는 지점 뒤에 추가:

```tsx
      <RatingMemoDialog
        entry={editingRating ? game : null}
        onClose={() => setEditingRating(false)}
      />
```

- [ ] **Step 3: 수동 검증 (CDP 또는 실제 앱)**

Explorer에서 코드있는 항목을 클릭해 DetailOverlay를 열고 "평점/메모" 버튼 클릭 → 별점과 메모 입력 후 저장 → 다시 열었을 때 값이 유지되는지 확인.

- [ ] **Step 4: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 모두 exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/RatingMemoDialog.tsx src/pages/Explorer/DetailOverlay.tsx
git commit -m "feat: add rating/memo edit dialog, wire into Explorer DetailOverlay"
```

---

### Task 6: 즐겨찾기 탭

**Files:**
- Create: `src/pages/Favorites/FavoritesPage.tsx`
- Create: `electron/main/database/gameUserDataRepository.ts` 확장 (`listFavoriteKeys`)
- Modify: `electron/main/database/gameUserDataRepository.test.ts`
- Modify: `shared/types/ipc.ts`
- Modify: `electron/main/ipc/gameUserDataHandlers.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/services/gameUserDataService.ts`
- Modify: `src/router.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `useGames`(기존), `useGameUserData`(Task 4).
- Produces: `window.api.gameUserData.listFavoriteKeys(): Promise<string[]>`, `useFavoriteKeys()`.

**설계**: 즐겨찾기 목록은 `game_user_data`에서 `isFavorite = true`인 `key` 목록만 가져오고, 실제 파일 정보(썸네일/이름/경로)는 이미 로드된 `useGames()`의 라이브 스캔 결과에서 코드 또는 경로로 매칭해 얻는다 — Gallery와 동일한 카드 UI를 재사용하되 목록만 필터링. 스캔되지 않는(파일이 삭제된) 즐겨찾기 항목은 이번 태스크에서는 표시하지 않는다 — 삭제된 파일도 계속 보여주는 것은 B그룹(플레이시간/최근플레이, `game_metadata` 캐시된 제목/커버 활용)에서 다룰 범위다.

- [ ] **Step 1: `gameUserDataRepository.ts`에 `listFavoriteKeys` 추가**

```ts
export function listFavoriteKeys(db: AppDatabase): string[] {
  return db
    .select({ key: gameUserData.key })
    .from(gameUserData)
    .where(eq(gameUserData.isFavorite, true))
    .all()
    .map((row) => row.key)
}
```

- [ ] **Step 2: `gameUserDataRepository.test.ts`에 실패하는 테스트 추가**

```ts
it('lists only the keys currently marked as favorite', () => {
  setFavorite(db, 'RJ01111111', 'code', true)
  setFavorite(db, 'RJ02222222', 'code', false)
  setFavorite(db, 'd:\\games\\folder', 'path', true)

  expect(listFavoriteKeys(db).sort()).toEqual(['RJ01111111', 'd:\\games\\folder'].sort())
})
```

- [ ] **Step 3: 실행해서 실패 후 통과 확인**

Run: `npm run test -- electron/main/database/gameUserDataRepository.test.ts`
Expected: 먼저 FAIL(`listFavoriteKeys` 없음) → Step 1 반영 후 PASS, 11 tests.

- [ ] **Step 4: `shared/types/ipc.ts`에 채널 추가**

`IPC_CHANNELS`에 추가:

```ts
  GAME_USER_DATA_LIST_FAVORITE_KEYS: 'game-user-data:list-favorite-keys',
```

- [ ] **Step 5: `gameUserDataHandlers.ts`에 핸들러 추가**

```ts
  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_LIST_FAVORITE_KEYS, () => {
    return listFavoriteKeys(db)
  })
```

(`import { ... listFavoriteKeys } from '../database/gameUserDataRepository'`에 추가)

- [ ] **Step 6: `electron/preload/index.ts`에 API 추가**

`gameUserData` 객체 안에 추가:

```ts
    listFavoriteKeys: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_LIST_FAVORITE_KEYS),
```

- [ ] **Step 7: `src/services/gameUserDataService.ts`에 훅 추가**

```ts
export function useFavoriteKeys() {
  return useQuery<string[]>({
    queryKey: ['game-user-data', 'favorite-keys'],
    queryFn: () => window.api.gameUserData.listFavoriteKeys(),
  })
}
```

- [ ] **Step 8: `src/pages/Favorites/FavoritesPage.tsx` 구현**

Gallery와 동일한 그리드 레이아웃을 그대로 쓰되 목록만 필터링한다:

```tsx
import { useGames } from '../../services/useGames'
import { useFavoriteKeys } from '../../services/gameUserDataService'
import { Skeleton } from '../../components/ui/skeleton'

export function FavoritesPage() {
  const { data: games, isLoading: gamesLoading } = useGames()
  const { data: favoriteKeys, isLoading: keysLoading } = useFavoriteKeys()

  if (gamesLoading || keysLoading || !games || !favoriteKeys) {
    return (
      <div className="grid grid-cols-5 gap-4 p-6">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full rounded-md" />
        ))}
      </div>
    )
  }

  const favoriteKeySet = new Set(favoriteKeys)
  const favorites = games.filter((game) => favoriteKeySet.has(game.code?.value ?? game.path))

  if (favorites.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        즐겨찾기한 게임이 없습니다.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-5 gap-4 p-6">
      {favorites.map((game) => (
        <div key={game.path} className="aspect-[3/4] rounded-md border border-border bg-card p-2">
          <p className="truncate text-sm font-medium">{game.name}</p>
        </div>
      ))}
    </div>
  )
}
```

주: 여기서는 카드 UI를 최소한으로만 둔다(썸네일/즐겨찾기 토글 등 Gallery의 풍부한 카드를 그대로 재사용하는 리팩터링은 이번 태스크 범위 밖 — `GameCard`를 `GalleryPage.tsx`에서 꺼내 공용 컴포넌트로 뽑는 작업은 C그룹 작업과 함께 검토).

- [ ] **Step 9: `src/router.tsx`에 라우트 추가**

`import { FavoritesPage } from './pages/Favorites/FavoritesPage'` 추가:

```ts
const favoritesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/favorites',
  component: FavoritesPage,
})
```

`routeTree`의 `addChildren`에 추가.

- [ ] **Step 10: `src/components/layout/Sidebar.tsx`에 메뉴 추가**

`import { ... Heart } from 'lucide-react'`에 `Heart` 추가. `navItems`에 추가:

```ts
  { to: '/favorites', label: '즐겨찾기', icon: Heart },
```

- [ ] **Step 11: 수동 검증 (CDP 또는 실제 앱)**

Gallery/List에서 몇 개를 즐겨찾기하고, 사이드바의 "즐겨찾기" 탭에서 그 항목들만 보이는지 확인.

- [ ] **Step 12: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 모두 exit 0.

- [ ] **Step 13: Commit**

```bash
git add electron/main/database/gameUserDataRepository.ts electron/main/database/gameUserDataRepository.test.ts shared/types/ipc.ts electron/main/ipc/gameUserDataHandlers.ts electron/preload/index.ts src/services/gameUserDataService.ts src/pages/Favorites/FavoritesPage.tsx src/router.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: add favorites tab"
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
git commit -m "fix: address issues found in favorites/rating/codeless-files verification pass"
```

---
