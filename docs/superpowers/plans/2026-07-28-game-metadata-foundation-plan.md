# 게임 메타데이터/사용자 데이터 기반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임 코드(RJ/VJ/ST)를 기본키로 하는 `game_metadata`(DLsite 크롤링 캐시)와 `game_user_data`(즐겨찾기/평점/메모/플레이시간 등 영속 데이터) 테이블 및 Repository를 만든다. 코드가 없는 파일은 정규화된 경로를 키로 쓰고, 나중에 코드가 부여되면 코드 키로 재키잉할 수 있다.

**Architecture:** 기존 `libraries`/`explorerTabs`/`sortPreferences`와 동일한 패턴 — Drizzle 스키마 + `client.ts`의 `CREATE TABLE IF NOT EXISTS` + Repository 모듈. 오늘은 두 테이블의 키 구조와 기본 CRUD + 재키잉만 구현하고, 실제 기능 컬럼(즐겨찾기 bool 등)은 각 기능이 구현될 때 별도 마이그레이션으로 추가한다.

**Tech Stack:** better-sqlite3, Drizzle ORM, Vitest (in-memory SQLite 테스트)

## Global Constraints

- TypeScript strict 모드, `npm run typecheck` 에러 0개.
- ESLint + Prettier 에러/경고 0개 (`npm run lint`, `npm run format:check`).
- SQL 접근은 Repository 모듈(`electron/main/database/*Repository.ts`)을 통해서만 — IPC 핸들러는 이 태스크 범위 밖(다음 단계에서 추가).
- 모든 신규 파일은 상대경로 import만 사용 (경로 별칭 없음).
- 테스트는 실제 in-memory SQLite(`createDbClient(':memory:')`) 대상으로 작성 — mock 금지.
- 스펙 참조: `docs/superpowers/specs/2026-07-28-game-management-expansion-design.md`.

---

### Task 1: `game_metadata` 테이블 및 Repository

**Files:**
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/client.ts`
- Create: `electron/main/database/gameMetadataRepository.ts`
- Test: `electron/main/database/gameMetadataRepository.test.ts`

**Interfaces:**
- Produces: `getGameMetadata(db, code)`, `touchGameMetadata(db, code)` — 이후 A그룹(DLsite 크롤링)이 실제 컬럼(`title`/`circle`/`releaseDate`/`coverImagePath`/`genres`)을 마이그레이션으로 추가해 확장한다.

- [ ] **Step 1: `electron/main/database/schema.ts`에 `gameMetadata` 테이블 추가**

기존 `appSettings`/`libraries`/`explorerTabs`/`sortPreferences`는 그대로 두고 파일 끝에 추가:

```ts
export const gameMetadata = sqliteTable('game_metadata', {
  code: text('code').primaryKey(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
```

- [ ] **Step 2: `electron/main/database/client.ts`에 `CREATE TABLE` 추가**

기존 `sort_preferences` 테이블 생성 구문 뒤에 추가:

```ts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS game_metadata (
      code TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
```

- [ ] **Step 3: 실패하는 테스트 작성**

`electron/main/database/gameMetadataRepository.test.ts` 생성:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { getGameMetadata, touchGameMetadata } from './gameMetadataRepository'

describe('gameMetadataRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns undefined when no metadata was ever recorded for a code', () => {
    expect(getGameMetadata(db, 'RJ01234567')).toBeUndefined()
  })

  it('creates a row on first touch and returns it', () => {
    touchGameMetadata(db, 'RJ01234567')
    const row = getGameMetadata(db, 'RJ01234567')
    expect(row?.code).toBe('RJ01234567')
    expect(typeof row?.createdAt).toBe('string')
    expect(row?.createdAt).toBe(row?.updatedAt)
  })

  it('updates updatedAt (but not createdAt) on a second touch', () => {
    touchGameMetadata(db, 'RJ01234567')
    const first = getGameMetadata(db, 'RJ01234567')

    touchGameMetadata(db, 'RJ01234567')
    const second = getGameMetadata(db, 'RJ01234567')

    expect(second?.createdAt).toBe(first?.createdAt)
    expect(second?.updatedAt).not.toBe(first?.updatedAt)
  })

  it('keeps different codes independent', () => {
    touchGameMetadata(db, 'RJ01234567')
    touchGameMetadata(db, 'VJ01004728')

    expect(getGameMetadata(db, 'RJ01234567')?.code).toBe('RJ01234567')
    expect(getGameMetadata(db, 'VJ01004728')?.code).toBe('VJ01004728')
  })
})
```

- [ ] **Step 4: 실행해서 실패 확인**

Run: `npm run test -- electron/main/database/gameMetadataRepository.test.ts`
Expected: FAIL — `gameMetadataRepository.ts` does not exist.

- [ ] **Step 5: `electron/main/database/gameMetadataRepository.ts` 구현**

```ts
import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { gameMetadata } from './schema'

export interface GameMetadataRow {
  code: string
  createdAt: string
  updatedAt: string
}

export function getGameMetadata(db: AppDatabase, code: string): GameMetadataRow | undefined {
  return db.select().from(gameMetadata).where(eq(gameMetadata.code, code)).get()
}

// Ensures a row exists for `code` and refreshes updatedAt - later tasks
// (A group's DLsite crawler) call this alongside writing the actual
// crawled columns they add via their own migration.
export function touchGameMetadata(db: AppDatabase, code: string): void {
  const now = new Date().toISOString()
  db.insert(gameMetadata)
    .values({ code, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameMetadata.code, set: { updatedAt: now } })
    .run()
}
```

- [ ] **Step 6: 실행해서 통과 확인**

Run: `npm run test -- electron/main/database/gameMetadataRepository.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 8: Commit**

```bash
git add electron/main/database/schema.ts electron/main/database/client.ts electron/main/database/gameMetadataRepository.ts electron/main/database/gameMetadataRepository.test.ts
git commit -m "feat: add game_metadata table and repository (crawl cache foundation)"
```

---

### Task 2: `game_user_data` 테이블, Repository, 재키잉

**Files:**
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/client.ts`
- Create: `electron/main/database/gameUserDataRepository.ts`
- Test: `electron/main/database/gameUserDataRepository.test.ts`

**Interfaces:**
- Produces: `getGameUserData(db, key)`, `touchGameUserData(db, key, keyType)`, `rekeyToCode(db, oldPathKey, newCode)` — D/B그룹이 실제 컬럼(`isFavorite`/`rating`/`memo`/`totalPlaytimeMs`/`lastPlayedAt`/`savePath`/`launchConfig`)을 마이그레이션으로 추가해 확장한다.

- [ ] **Step 1: `electron/main/database/schema.ts`에 `gameUserData` 테이블 추가**

Task 1의 `gameMetadata` 뒤에 추가:

```ts
export const gameUserData = sqliteTable('game_user_data', {
  key: text('key').primaryKey(),
  keyType: text('key_type').notNull(), // 'code' | 'path'
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
```

- [ ] **Step 2: `electron/main/database/client.ts`에 `CREATE TABLE` 추가**

`game_metadata` 생성 구문 뒤에 추가:

```ts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS game_user_data (
      key TEXT PRIMARY KEY,
      key_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
```

- [ ] **Step 3: 실패하는 테스트 작성**

`electron/main/database/gameUserDataRepository.test.ts` 생성:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { getGameUserData, touchGameUserData, rekeyToCode } from './gameUserDataRepository'

describe('gameUserDataRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns undefined when no user data exists for a key', () => {
    expect(getGameUserData(db, 'RJ01234567')).toBeUndefined()
  })

  it('creates a code-keyed row', () => {
    touchGameUserData(db, 'RJ01234567', 'code')
    const row = getGameUserData(db, 'RJ01234567')
    expect(row?.key).toBe('RJ01234567')
    expect(row?.keyType).toBe('code')
  })

  it('creates a path-keyed row for a code-less file', () => {
    touchGameUserData(db, 'd:\\games\\some-folder', 'path')
    const row = getGameUserData(db, 'd:\\games\\some-folder')
    expect(row?.keyType).toBe('path')
  })

  it('rekeys a path-keyed row to a code, preserving createdAt', () => {
    touchGameUserData(db, 'd:\\games\\some-folder', 'path')
    const before = getGameUserData(db, 'd:\\games\\some-folder')

    rekeyToCode(db, 'd:\\games\\some-folder', 'RJ09999999')

    expect(getGameUserData(db, 'd:\\games\\some-folder')).toBeUndefined()
    const after = getGameUserData(db, 'RJ09999999')
    expect(after?.keyType).toBe('code')
    expect(after?.createdAt).toBe(before?.createdAt)
  })

  it('rekeying is a no-op if the old path key does not exist', () => {
    expect(() => rekeyToCode(db, 'd:\\nope', 'RJ00000000')).not.toThrow()
    expect(getGameUserData(db, 'RJ00000000')).toBeUndefined()
  })
})
```

- [ ] **Step 4: 실행해서 실패 확인**

Run: `npm run test -- electron/main/database/gameUserDataRepository.test.ts`
Expected: FAIL — `gameUserDataRepository.ts` does not exist.

- [ ] **Step 5: `electron/main/database/gameUserDataRepository.ts` 구현**

```ts
import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { gameUserData } from './schema'

export type GameUserDataKeyType = 'code' | 'path'

export interface GameUserDataRow {
  key: string
  keyType: GameUserDataKeyType
  createdAt: string
  updatedAt: string
}

export function getGameUserData(db: AppDatabase, key: string): GameUserDataRow | undefined {
  const row = db.select().from(gameUserData).where(eq(gameUserData.key, key)).get()
  if (!row) return undefined
  return { ...row, keyType: row.keyType as GameUserDataKeyType }
}

// Ensures a row exists for `key` and refreshes updatedAt - later tasks
// (D/B group features) call this alongside writing the actual user-data
// columns they add via their own migration.
export function touchGameUserData(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType
): void {
  const now = new Date().toISOString()
  db.insert(gameUserData)
    .values({ key, keyType, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameUserData.key, set: { updatedAt: now } })
    .run()
}

// Moves a path-keyed row (a code-less file the user later assigned a code
// to) onto the code as its new primary key, preserving createdAt. No-op if
// the old path key was never recorded - nothing to migrate.
export function rekeyToCode(db: AppDatabase, oldPathKey: string, newCode: string): void {
  const existing = getGameUserData(db, oldPathKey)
  if (!existing || existing.keyType !== 'path') return

  db.transaction((tx) => {
    tx.delete(gameUserData).where(eq(gameUserData.key, oldPathKey)).run()
    tx.insert(gameUserData)
      .values({
        key: newCode,
        keyType: 'code',
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({ target: gameUserData.key, set: { updatedAt: new Date().toISOString() } })
      .run()
  })
}
```

- [ ] **Step 6: 실행해서 통과 확인**

Run: `npm run test -- electron/main/database/gameUserDataRepository.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 8: Commit**

```bash
git add electron/main/database/schema.ts electron/main/database/client.ts electron/main/database/gameUserDataRepository.ts electron/main/database/gameUserDataRepository.test.ts
git commit -m "feat: add game_user_data table, repository, and code rekeying"
```

---

### Task 3: 최종 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 검증 스위트 실행**

```bash
npm run lint
npm run typecheck
npm run test
npm run format:check
```
Expected: 넷 다 exit 0.

- [ ] **Step 2: Commit** (Step 1에서 수정이 필요했을 때만)

```bash
git add -A
git commit -m "fix: address issues found in foundation verification pass"
```

---
