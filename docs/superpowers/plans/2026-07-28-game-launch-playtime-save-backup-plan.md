# 게임 실행·플레이시간·세이브 백업 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임 폴더 내 실행파일을 선택하고 일반/Locale Emulator 방식으로 실행하며, 세션 플레이시간을 누적 기록한다. 세이브 폴더를 사용자가 지정하면 별도 캐시 디렉터리로 백업해 게임 파일이 삭제돼도 유지되게 한다. 최근 플레이 탭을 추가한다.

**Architecture:** `game_user_data`에 `launchConfig`(json), `totalPlaytimeMs`, `lastPlayedAt`, `savePath` 컬럼을 추가한다(선행 D그룹 플랜에서 이미 `isFavorite`/`rating`/`memo`가 추가됐으므로 이어서 확장). 실행은 Node `child_process.spawn`으로 자식 프로세스를 띄우고 종료(`exit` 이벤트)까지 대기해 세션 시간을 계산한다 — main 프로세스가 그동안 다른 IPC를 처리 못 하면 안 되므로 `spawn`은 non-blocking이고 종료 대기는 Promise로만 한다.

**Tech Stack:** Node `child_process`(내장), 기존 스택.

## Global Constraints

- TypeScript strict 모드, `npm run typecheck` 에러 0개.
- ESLint + Prettier 에러/경고 0개.
- SQL 접근은 Repository 모듈을 통해서만.
- 모든 신규 파일은 상대경로 import만 사용.
- **Locale Emulator 관련 불확실성**: Locale Emulator는 2022년부터 개발이 중단(archived)된 프로젝트이고, 공식 문서에서 `LEProc.exe`의 정확한 커맨드라인 문법을 확인하지 못했다. 이 플랜의 Task 3은 커뮤니티에 알려진 통상적 사용법(`LEProc.exe "대상.exe"`를 인자로 넘기면 GUI에서 설정한 기본 프로파일로 실행됨 — 드래그앤드롭과 동일한 방식)을 최선의 가정으로 구현하되, 로컬에 Locale Emulator가 실제로 설치되어 있다면 그 설치로 직접 검증하고, 설치되어 있지 않다면 그 사실을 구현 보고서에 명확히 남긴다. 사용자는 향후 자체 로케일 전환 실행 기능(LE를 대체) 추가를 검토하기로 했다 — 이번 범위에는 포함하지 않는다.
- 선행 플랜(`2026-07-28-favorites-rating-codeless-files-plan.md`)이 이미 구현되어 `game_user_data`에 `isFavorite`/`rating`/`memo`가 있고, `electron/main/ipc/resolveGameEntryKey.ts`(`resolveGameEntryKey` 함수)가 존재한다고 가정한다.
- 실행파일 선택/목록은 **폴더 타입 항목에만** 적용한다. 압축파일(zip 등, 파일 타입) 항목은 이번 범위에서 실행 기능을 지원하지 않는다(압축 해제는 별도 스펙의 제외 항목) — UI에서 비활성화하고 이유를 안내한다.
- 스펙 참조: `docs/superpowers/specs/2026-07-28-game-management-expansion-design.md`.

---

### Task 1: `game_user_data`에 실행/플레이시간/세이브 컬럼 추가

**Files:**
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/client.ts`
- Modify: `electron/main/database/gameUserDataRepository.ts`
- Modify: `electron/main/database/gameUserDataRepository.test.ts`

**Interfaces:**
- Produces: `setLaunchConfig(db, key, keyType, config)`, `recordPlaySession(db, key, keyType, sessionMs)`, `setSavePath(db, key, keyType, savePath)` — Task 3/5/6이 소비. `GameUserDataRow`에 `launchConfig`/`totalPlaytimeMs`/`lastPlayedAt`/`savePath` 필드 추가.

- [ ] **Step 1: `schema.ts`의 `gameUserData`에 컬럼 추가**

```ts
export const gameUserData = sqliteTable('game_user_data', {
  key: text('key').primaryKey(),
  keyType: text('key_type').notNull(),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
  rating: integer('rating'),
  memo: text('memo'),
  launchConfig: text('launch_config'), // JSON: { executablePath, launchMode }
  totalPlaytimeMs: integer('total_playtime_ms').notNull().default(0),
  lastPlayedAt: text('last_played_at'),
  savePath: text('save_path'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
```

- [ ] **Step 2: `client.ts`의 `game_user_data` 생성 구문에 컬럼 추가**

```ts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS game_user_data (
      key TEXT PRIMARY KEY,
      key_type TEXT NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      rating INTEGER,
      memo TEXT,
      launch_config TEXT,
      total_playtime_ms INTEGER NOT NULL DEFAULT 0,
      last_played_at TEXT,
      save_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
```

- [ ] **Step 3: `gameUserDataRepository.test.ts`에 실패하는 테스트 추가**

```ts
it('stores and retrieves a launch config', () => {
  setLaunchConfig(db, 'RJ01234567', 'code', {
    executablePath: 'C:\\games\\RJ01234567\\game.exe',
    launchMode: 'normal',
  })

  const row = getGameUserData(db, 'RJ01234567')
  expect(row?.launchConfig).toEqual({
    executablePath: 'C:\\games\\RJ01234567\\game.exe',
    launchMode: 'normal',
  })
})

it('defaults totalPlaytimeMs to 0 and lastPlayedAt to null', () => {
  touchGameUserData(db, 'RJ01234567', 'code')
  const row = getGameUserData(db, 'RJ01234567')
  expect(row?.totalPlaytimeMs).toBe(0)
  expect(row?.lastPlayedAt).toBeNull()
})

it('accumulates playtime across multiple sessions and updates lastPlayedAt', () => {
  recordPlaySession(db, 'RJ01234567', 'code', 60_000)
  recordPlaySession(db, 'RJ01234567', 'code', 30_000)

  const row = getGameUserData(db, 'RJ01234567')
  expect(row?.totalPlaytimeMs).toBe(90_000)
  expect(row?.lastPlayedAt).not.toBeNull()
})

it('stores a save path independently of other fields', () => {
  setSavePath(db, 'RJ01234567', 'code', 'C:\\Users\\me\\AppData\\LocalLow\\game\\save')
  expect(getGameUserData(db, 'RJ01234567')?.savePath).toBe(
    'C:\\Users\\me\\AppData\\LocalLow\\game\\save'
  )
})
```

- [ ] **Step 4: 실행해서 실패 확인**

Run: `npm run test -- electron/main/database/gameUserDataRepository.test.ts`
Expected: FAIL — 새 함수들이 없고 `getGameUserData`가 새 필드를 반환하지 않음.

- [ ] **Step 5: `gameUserDataRepository.ts` 확장**

`GameUserDataRow`와 `getGameUserData`를 교체하고 함수 세 개 추가:

```ts
export interface LaunchConfig {
  executablePath: string
  launchMode: 'normal' | 'locale-emulator'
}

export interface GameUserDataRow {
  key: string
  keyType: GameUserDataKeyType
  isFavorite: boolean
  rating: number | null
  memo: string | null
  launchConfig: LaunchConfig | null
  totalPlaytimeMs: number
  lastPlayedAt: string | null
  savePath: string | null
  createdAt: string
  updatedAt: string
}

export function getGameUserData(db: AppDatabase, key: string): GameUserDataRow | undefined {
  const row = db.select().from(gameUserData).where(eq(gameUserData.key, key)).get()
  if (!row) return undefined
  return {
    ...row,
    keyType: row.keyType as GameUserDataKeyType,
    launchConfig: row.launchConfig ? (JSON.parse(row.launchConfig) as LaunchConfig) : null,
  }
}

export function setLaunchConfig(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType,
  config: LaunchConfig
): void {
  const now = new Date().toISOString()
  const launchConfig = JSON.stringify(config)
  db.insert(gameUserData)
    .values({ key, keyType, launchConfig, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameUserData.key, set: { launchConfig, updatedAt: now } })
    .run()
}

export function recordPlaySession(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType,
  sessionMs: number
): void {
  const existing = getGameUserData(db, key)
  const now = new Date().toISOString()
  const totalPlaytimeMs = (existing?.totalPlaytimeMs ?? 0) + sessionMs
  db.insert(gameUserData)
    .values({ key, keyType, totalPlaytimeMs, lastPlayedAt: now, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: gameUserData.key,
      set: { totalPlaytimeMs, lastPlayedAt: now, updatedAt: now },
    })
    .run()
}

export function setSavePath(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType,
  savePath: string
): void {
  const now = new Date().toISOString()
  db.insert(gameUserData)
    .values({ key, keyType, savePath, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameUserData.key, set: { savePath, updatedAt: now } })
    .run()
}
```

`rekeyToCode`도 새 필드들을 보존하도록 수정(D그룹 플랜에서 이미 `isFavorite`/`rating`/`memo`를 보존하도록 고쳐뒀으므로, 그 값 목록에 세 필드를 추가):

```ts
    tx.insert(gameUserData)
      .values({
        key: newCode,
        keyType: 'code',
        isFavorite: existing.isFavorite,
        rating: existing.rating,
        memo: existing.memo,
        launchConfig: existing.launchConfig ? JSON.stringify(existing.launchConfig) : null,
        totalPlaytimeMs: existing.totalPlaytimeMs,
        lastPlayedAt: existing.lastPlayedAt,
        savePath: existing.savePath,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      })
```

- [ ] **Step 6: 재키잉이 새 필드도 보존하는지 검증하는 테스트 추가**

```ts
it('rekeying preserves launchConfig/playtime/savePath too', () => {
  setLaunchConfig(db, 'd:\\games\\some-folder', 'path', {
    executablePath: 'd:\\games\\some-folder\\game.exe',
    launchMode: 'normal',
  })
  recordPlaySession(db, 'd:\\games\\some-folder', 'path', 120_000)
  setSavePath(db, 'd:\\games\\some-folder', 'path', 'd:\\saves\\some-folder')

  rekeyToCode(db, 'd:\\games\\some-folder', 'RJ07777777')

  const after = getGameUserData(db, 'RJ07777777')
  expect(after?.launchConfig?.executablePath).toBe('d:\\games\\some-folder\\game.exe')
  expect(after?.totalPlaytimeMs).toBe(120_000)
  expect(after?.savePath).toBe('d:\\saves\\some-folder')
})
```

- [ ] **Step 7: 실행해서 통과 확인**

Run: `npm run test -- electron/main/database/gameUserDataRepository.test.ts`
Expected: PASS, 16 tests(D그룹의 11개 + 이번 5개).

- [ ] **Step 8: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 9: Commit**

```bash
git add electron/main/database/schema.ts electron/main/database/client.ts electron/main/database/gameUserDataRepository.ts electron/main/database/gameUserDataRepository.test.ts
git commit -m "feat: add launch config, playtime, and save path columns"
```

---

### Task 2: 게임 폴더 내 실행파일 목록 조회

**Files:**
- Create: `electron/main/launch/listExecutables.ts`
- Test: `electron/main/launch/listExecutables.test.ts`

**Interfaces:**
- Produces: `listExecutables(folderPath: string): Promise<string[]>` — 폴더 내(하위 폴더 포함, 얕은 재귀는 아님 — 최상위 1단계만) `.exe` 파일의 절대경로 목록. Task 4(IPC)가 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`electron/main/launch/listExecutables.test.ts` 생성:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listExecutables } from './listExecutables'

describe('listExecutables', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlibrary-exe-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('finds .exe files at the top level of the folder', async () => {
    await writeFile(join(dir, 'game.exe'), '')
    await writeFile(join(dir, 'readme.txt'), '')

    const result = await listExecutables(dir)
    expect(result).toEqual([join(dir, 'game.exe')])
  })

  it('is case-insensitive about the .exe extension', async () => {
    await writeFile(join(dir, 'Game.EXE'), '')
    expect(await listExecutables(dir)).toEqual([join(dir, 'Game.EXE')])
  })

  it('does not descend into subfolders', async () => {
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'sub', 'nested.exe'), '')
    await writeFile(join(dir, 'top.exe'), '')

    expect(await listExecutables(dir)).toEqual([join(dir, 'top.exe')])
  })

  it('returns an empty array for a nonexistent path', async () => {
    expect(await listExecutables(join(dir, 'does-not-exist'))).toEqual([])
  })
})
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `npm run test -- electron/main/launch/listExecutables.test.ts`
Expected: FAIL — `listExecutables.ts` does not exist.

- [ ] **Step 3: `electron/main/launch/listExecutables.ts` 구현**

```ts
import { readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'

// 최상위 1단계만 본다 - 실행파일 선택은 사용자가 직접 고르는 UI이므로 깊은
// 재귀로 노이즈를 늘릴 필요가 없다(설치파일/제거파일도 섞여 나올 수 있지만
// 최종 선택은 사용자 몫 - 스펙의 명시적 제외 사항).
export async function listExecutables(folderPath: string): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(folderPath)
  } catch {
    return []
  }
  return names.filter((name) => extname(name).toLowerCase() === '.exe').map((name) => join(folderPath, name))
}
```

- [ ] **Step 4: 실행해서 통과 확인**

Run: `npm run test -- electron/main/launch/listExecutables.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 6: Commit**

```bash
git add electron/main/launch/listExecutables.ts electron/main/launch/listExecutables.test.ts
git commit -m "feat: add executable file listing for launch-config picker"
```

---

### Task 3: Locale Emulator 감지 및 게임 실행

**Files:**
- Create: `electron/main/launch/localeEmulator.ts`
- Create: `electron/main/launch/launchGame.ts`
- Test: `electron/main/launch/localeEmulator.test.ts`
- Test: `electron/main/launch/launchGame.test.ts`

**Interfaces:**
- Produces: `detectLocaleEmulator(): Promise<string | null>`(설치돼 있으면 `LEProc.exe` 절대경로, 아니면 null), `launchGame(config: LaunchConfig): Promise<{ sessionMs: number }>` — 프로세스 종료까지 대기 후 세션 시간(ms) 반환. Task 4(IPC)가 소비.

**Locale Emulator 관련 불확실성 — Global Constraints 참고**: `detectLocaleEmulator`는 흔히 알려진 설치 경로(`Program Files\Locale Emulator\LEProc.exe`, `Program Files (x86)\Locale Emulator\LEProc.exe`)를 확인하는 방식으로 구현한다(레지스트리 키는 검증하지 못해 사용하지 않음). `launchGame`의 `locale-emulator` 분기는 `LEProc.exe`를 대상 exe 경로 하나만 인자로 스폰하는 최선의 가정으로 구현한다 — **로컬에 실제 설치가 있다면 반드시 직접 실행해 검증하고, 결과(정상 동작/문제)를 구현 보고서에 남긴다.** 설치가 없어 검증 불가능하면 그 사실도 명확히 남긴다.

- [ ] **Step 1: `localeEmulator.test.ts` 작성 (실패 확인 없이 바로 구현 — 파일 경로 확인은 mock 없이 실제 fs로 검증 가능)**

`electron/main/launch/localeEmulator.test.ts` 생성:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findLocaleEmulatorAt } from './localeEmulator'

describe('findLocaleEmulatorAt', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlibrary-le-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns the LEProc.exe path when it exists under the given base dir', async () => {
    await mkdir(join(dir, 'Locale Emulator'), { recursive: true })
    await writeFile(join(dir, 'Locale Emulator', 'LEProc.exe'), '')

    const result = await findLocaleEmulatorAt(dir)
    expect(result).toBe(join(dir, 'Locale Emulator', 'LEProc.exe'))
  })

  it('returns null when LEProc.exe does not exist under the given base dir', async () => {
    expect(await findLocaleEmulatorAt(dir)).toBeNull()
  })
})
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `npm run test -- electron/main/launch/localeEmulator.test.ts`
Expected: FAIL — `localeEmulator.ts` does not exist.

- [ ] **Step 3: `electron/main/launch/localeEmulator.ts` 구현**

```ts
import { access } from 'node:fs/promises'
import { join } from 'node:path'

// 특정 기준 디렉터리 아래에 LEProc.exe가 있는지 확인하는 순수 로직 -
// detectLocaleEmulator가 실제 Program Files 경로들로 이 함수를 호출한다.
// 테스트 가능하도록 기준 디렉터리를 인자로 분리했다.
export async function findLocaleEmulatorAt(baseDir: string): Promise<string | null> {
  const candidate = join(baseDir, 'Locale Emulator', 'LEProc.exe')
  try {
    await access(candidate)
    return candidate
  } catch {
    return null
  }
}

// 알려진 설치 경로만 확인한다 - 레지스트리 키는 공식 문서로 확인하지
// 못해 사용하지 않는다. 두 경로 모두 없으면 미설치로 간주한다.
export async function detectLocaleEmulator(): Promise<string | null> {
  const candidateBases = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']].filter(
    (base): base is string => Boolean(base)
  )
  for (const base of candidateBases) {
    const found = await findLocaleEmulatorAt(base)
    if (found) return found
  }
  return null
}
```

- [ ] **Step 4: 실행해서 통과 확인**

Run: `npm run test -- electron/main/launch/localeEmulator.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: `launchGame.test.ts` 작성**

실제 프로세스를 띄워야 하므로, Windows에 항상 존재하는 실행파일로 세션 시간 측정을 검증한다(테스트가 몇 초씩 걸리지 않도록 즉시 종료하는 것을 고른다):

`electron/main/launch/launchGame.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest'
import { launchGame } from './launchGame'

describe('launchGame', () => {
  it('waits for the process to exit and reports a non-negative session duration', async () => {
    // help.exe는 Windows에 기본 내장되어 있고 도움말을 출력한 뒤 바로
    // 종료되므로, 테스트를 오래 걸리게 하거나 사람의 조작을 기다리지
    // 않는다.
    const result = await launchGame({ executablePath: 'help.exe', launchMode: 'normal' })
    expect(result.sessionMs).toBeGreaterThanOrEqual(0)
  }, 10_000)

  it('rejects when the executable does not exist', async () => {
    await expect(
      launchGame({ executablePath: 'C:\\does\\not\\exist.exe', launchMode: 'normal' })
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 6: 실행해서 실패 확인**

Run: `npm run test -- electron/main/launch/launchGame.test.ts`
Expected: FAIL — `launchGame.ts` does not exist.

- [ ] **Step 7: `electron/main/launch/launchGame.ts` 구현**

```ts
import { spawn } from 'node:child_process'
import { detectLocaleEmulator } from './localeEmulator'
import type { LaunchConfig } from '../database/gameUserDataRepository'

export async function launchGame(config: LaunchConfig): Promise<{ sessionMs: number }> {
  const [command, args] = await resolveCommand(config)
  const start = Date.now()

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: false })

    child.once('error', (error) => reject(error))
    child.once('exit', () => resolve({ sessionMs: Date.now() - start }))
  })
}

async function resolveCommand(config: LaunchConfig): Promise<[string, string[]]> {
  if (config.launchMode === 'normal') {
    return [config.executablePath, []]
  }

  const leProcPath = await detectLocaleEmulator()
  if (!leProcPath) {
    throw new Error('Locale Emulator가 설치되어 있지 않습니다.')
  }
  // 최선으로 알려진 사용법: 대상 exe 경로를 인자로 넘기면 LE GUI에서 설정한
  // 기본 프로파일(보통 일본어)로 실행됨 - 공식 문서로 검증하지 못한 가정이므로
  // 로컬에 LE가 설치되어 있다면 실제로 확인할 것 (이 태스크의 Global
  // Constraints 참고).
  return [leProcPath, [config.executablePath]]
}
```

- [ ] **Step 8: 실행해서 통과 확인**

Run: `npm run test -- electron/main/launch/launchGame.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 9: Locale Emulator 로컬 검증 (가능한 경우)**

로컬 개발 환경에 Locale Emulator가 실제로 설치되어 있는지 확인(`electron/main/launch/localeEmulator.ts`의 `detectLocaleEmulator()`를 임시 스크립트로 직접 호출하거나 알려진 경로를 눈으로 확인). 설치되어 있다면:
1. 아무 exe(메모장 등)를 `locale-emulator` 모드로 `launchGame` 직접 호출해 실제로 LE를 통해 실행되는지 확인.
2. 문제가 있으면(인자 문법이 다르거나 LE가 조용히 무시함) `resolveCommand`의 `locale-emulator` 분기를 관찰한 실제 동작에 맞게 수정.
3. 결과(성공/실패/무엇을 고쳤는지)를 구현 보고서에 기록.

설치되어 있지 않다면 그 사실을 구현 보고서에 명확히 남기고 다음 태스크로 진행 — 이 불확실성은 최종 검증(Task 8)에서도 다시 언급한다.

- [ ] **Step 10: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 11: Commit**

```bash
git add electron/main/launch/localeEmulator.ts electron/main/launch/localeEmulator.test.ts electron/main/launch/launchGame.ts electron/main/launch/launchGame.test.ts
git commit -m "feat: add Locale Emulator detection and game launch with session timing"
```

---

### Task 4: 실행/exe목록 IPC 핸들러

**Files:**
- Modify: `shared/types/ipc.ts`
- Create: `electron/main/ipc/launchHandlers.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Consumes: `listExecutables`(Task 2), `launchGame`/`detectLocaleEmulator`(Task 3), `setLaunchConfig`/`recordPlaySession`(Task 1), `resolveGameEntryKey`(D그룹 플랜에서 이미 생성됨).
- Produces: `window.api.launch.listExecutables(folderPath)`, `window.api.launch.isLocaleEmulatorAvailable()`, `window.api.launch.setConfig(code, path, config)`, `window.api.launch.launch(code, path)` — Task 6이 소비.

- [ ] **Step 1: `shared/types/ipc.ts`에 채널과 스키마 추가**

```ts
  LAUNCH_LIST_EXECUTABLES: 'launch:list-executables',
  LAUNCH_IS_LOCALE_EMULATOR_AVAILABLE: 'launch:is-locale-emulator-available',
  LAUNCH_SET_CONFIG: 'launch:set-config',
  LAUNCH_GAME: 'launch:launch-game',
```

파일 끝에 추가:

```ts
export const LaunchConfigSchema = z.object({
  executablePath: z.string(),
  launchMode: z.enum(['normal', 'locale-emulator']),
})
export type LaunchConfigDto = z.infer<typeof LaunchConfigSchema>

export const ListExecutablesRequestSchema = z.object({
  folderPath: z.string(),
})

export const SetLaunchConfigRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  config: LaunchConfigSchema,
})

export const LaunchGameRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
})
```

- [ ] **Step 2: `electron/main/ipc/launchHandlers.ts` 생성**

```ts
import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  LaunchGameRequestSchema,
  ListExecutablesRequestSchema,
  SetLaunchConfigRequestSchema,
} from '../../../shared/types/ipc'
import { listExecutables } from '../launch/listExecutables'
import { detectLocaleEmulator } from '../launch/localeEmulator'
import { launchGame } from '../launch/launchGame'
import { getGameUserData, recordPlaySession, setLaunchConfig } from '../database/gameUserDataRepository'
import { resolveGameEntryKey } from './resolveGameEntryKey'
import type { AppDatabase } from '../database/client'

export function registerLaunchHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.LAUNCH_LIST_EXECUTABLES, (_event, payload: unknown) => {
    const { folderPath } = ListExecutablesRequestSchema.parse(payload)
    return listExecutables(folderPath)
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCH_IS_LOCALE_EMULATOR_AVAILABLE, async () => {
    return (await detectLocaleEmulator()) !== null
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCH_SET_CONFIG, (_event, payload: unknown) => {
    const { identifier, config } = SetLaunchConfigRequestSchema.parse(payload)
    const { key, keyType } = resolveGameEntryKey(identifier)
    setLaunchConfig(db, key, keyType, config)
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCH_GAME, async (_event, payload: unknown) => {
    const { identifier } = LaunchGameRequestSchema.parse(payload)
    const { key, keyType } = resolveGameEntryKey(identifier)

    const userData = getGameUserData(db, key)
    if (!userData?.launchConfig) {
      throw new Error('실행 설정이 없습니다. 먼저 실행파일을 지정해 주세요.')
    }

    const { sessionMs } = await launchGame(userData.launchConfig)
    recordPlaySession(db, key, keyType, sessionMs)
    return { sessionMs }
  })
}
```

- [ ] **Step 3: `electron/main/index.ts`에 핸들러 등록**

`import { registerLaunchHandlers } from './ipc/launchHandlers'` 추가, `app.whenReady().then(...)` 안에서 기존 등록 호출들 옆에 `registerLaunchHandlers(db)` 추가.

- [ ] **Step 4: `electron/preload/index.ts`에 API 노출**

```ts
  launch: {
    listExecutables: (folderPath: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_LIST_EXECUTABLES, { folderPath }),
    isLocaleEmulatorAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_IS_LOCALE_EMULATOR_AVAILABLE),
    setConfig: (code: GameCode | null, path: string, config: LaunchConfigDto): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_SET_CONFIG, { identifier: { code, path }, config }),
    launch: (code: GameCode | null, path: string): Promise<{ sessionMs: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_GAME, { identifier: { code, path } }),
  },
```

`import type { ... LaunchConfigDto } from '../../shared/types/ipc'`를 기존 타입 import에 추가.

- [ ] **Step 5: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 6: Commit**

```bash
git add shared/types/ipc.ts electron/main/ipc/launchHandlers.ts electron/main/index.ts electron/preload/index.ts
git commit -m "feat: add launch config and launch-game IPC handlers"
```

---

### Task 5: 세이브 파일 백업

**Files:**
- Create: `electron/main/save/backupSave.ts`
- Test: `electron/main/save/backupSave.test.ts`
- Modify: `shared/types/ipc.ts`
- Create: `electron/main/ipc/saveHandlers.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Consumes: `resolveGameEntryKey`(D그룹 플랜에서 이미 생성됨).
- Produces: `backupSave(sourceDir: string, backupDir: string): Promise<void>`(재귀 복사), `window.api.save.pickFolder(): Promise<string | null>`, `window.api.save.setPath(code, path, savePath)`, `window.api.save.backupNow(code, path)` — Task 7이 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`electron/main/save/backupSave.test.ts` 생성:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backupSave } from './backupSave'

describe('backupSave', () => {
  let sourceDir: string
  let backupDir: string

  beforeEach(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), 'dlibrary-save-src-'))
    backupDir = join(await mkdtemp(join(tmpdir(), 'dlibrary-save-dst-')), 'nested')
  })

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true })
    await rm(backupDir, { recursive: true, force: true })
  })

  it('copies files and subfolders from source to backup, creating the backup dir', async () => {
    await mkdir(join(sourceDir, 'sub'))
    await writeFile(join(sourceDir, 'save1.dat'), 'hello')
    await writeFile(join(sourceDir, 'sub', 'save2.dat'), 'world')

    await backupSave(sourceDir, backupDir)

    expect(await readFile(join(backupDir, 'save1.dat'), 'utf-8')).toBe('hello')
    expect(await readFile(join(backupDir, 'sub', 'save2.dat'), 'utf-8')).toBe('world')
  })

  it('overwrites an existing backup on repeated calls', async () => {
    await writeFile(join(sourceDir, 'save1.dat'), 'first')
    await backupSave(sourceDir, backupDir)

    await writeFile(join(sourceDir, 'save1.dat'), 'second')
    await backupSave(sourceDir, backupDir)

    expect(await readFile(join(backupDir, 'save1.dat'), 'utf-8')).toBe('second')
  })
})
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `npm run test -- electron/main/save/backupSave.test.ts`
Expected: FAIL — `backupSave.ts` does not exist.

- [ ] **Step 3: `electron/main/save/backupSave.ts` 구현**

Node 16.7+에 내장된 `fs.cp`(재귀 복사, 덮어쓰기 지원)를 사용한다:

```ts
import { cp, mkdir } from 'node:fs/promises'

// 게임 파일과 완전히 분리된 백업 디렉터리(caller가 넘기는 backupDir, 보통
// userData/saves/{code}/)로 세이브 폴더를 통째로 복사한다. 매번 전체
// 덮어쓰기 - 증분 동기화는 하지 않는다(세이브 파일은 보통 크지 않음).
export async function backupSave(sourceDir: string, backupDir: string): Promise<void> {
  await mkdir(backupDir, { recursive: true })
  await cp(sourceDir, backupDir, { recursive: true, force: true })
}
```

- [ ] **Step 4: 실행해서 통과 확인**

Run: `npm run test -- electron/main/save/backupSave.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: `shared/types/ipc.ts`에 채널과 스키마 추가**

```ts
  SAVE_PICK_FOLDER: 'save:pick-folder',
  SAVE_SET_PATH: 'save:set-path',
  SAVE_BACKUP_NOW: 'save:backup-now',
```

파일 끝에 추가:

```ts
export const SetSavePathRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  savePath: z.string(),
})

export const BackupSaveNowRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
})
```

- [ ] **Step 6: `electron/main/ipc/saveHandlers.ts` 생성**

```ts
import { app, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import {
  BackupSaveNowRequestSchema,
  IPC_CHANNELS,
  SetSavePathRequestSchema,
} from '../../../shared/types/ipc'
import { backupSave } from '../save/backupSave'
import { getGameUserData, setSavePath } from '../database/gameUserDataRepository'
import { resolveGameEntryKey } from './resolveGameEntryKey'
import type { AppDatabase } from '../database/client'

export function registerSaveHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SAVE_PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_SET_PATH, (_event, payload: unknown) => {
    const { identifier, savePath } = SetSavePathRequestSchema.parse(payload)
    const { key, keyType } = resolveGameEntryKey(identifier)
    setSavePath(db, key, keyType, savePath)
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_BACKUP_NOW, async (_event, payload: unknown) => {
    const { identifier } = BackupSaveNowRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)

    const userData = getGameUserData(db, key)
    if (!userData?.savePath) {
      throw new Error('백업할 세이브 경로가 지정되어 있지 않습니다.')
    }

    const backupDir = join(app.getPath('userData'), 'saves', key)
    await backupSave(userData.savePath, backupDir)
  })
}
```

- [ ] **Step 7: `electron/main/index.ts`에 핸들러 등록**

`import { registerSaveHandlers } from './ipc/saveHandlers'` 추가, `app.whenReady().then(...)` 안에서 기존 등록 호출들 옆에 `registerSaveHandlers(db)` 추가.

- [ ] **Step 8: `electron/preload/index.ts`에 API 노출**

```ts
  save: {
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.SAVE_PICK_FOLDER),
    setPath: (code: GameCode | null, path: string, savePath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_SET_PATH, { identifier: { code, path }, savePath }),
    backupNow: (code: GameCode | null, path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_BACKUP_NOW, { identifier: { code, path } }),
  },
```

- [ ] **Step 9: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 10: Commit**

```bash
git add electron/main/save/backupSave.ts electron/main/save/backupSave.test.ts shared/types/ipc.ts electron/main/ipc/saveHandlers.ts electron/main/index.ts electron/preload/index.ts
git commit -m "feat: add save folder backup (path config + copy-on-demand)"
```

---

### Task 6: 렌더러 서비스 + 실행 설정 팝업 + DetailOverlay 연결

**Files:**
- Create: `src/services/launchService.ts`
- Create: `src/services/saveService.ts`
- Create: `src/components/game/LaunchConfigDialog.tsx`
- Modify: `src/pages/Explorer/DetailOverlay.tsx`

**Interfaces:**
- Consumes: `window.api.launch.*`(Task 4), `window.api.save.*`(Task 5).
- Produces: `useListExecutables`, `useSetLaunchConfig`, `useLaunchGame`, `usePickSaveFolder`, `useSetSavePath`, `useBackupSaveNow`.

- [ ] **Step 1: `src/services/launchService.ts` 구현**

```ts
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'
import type { LaunchConfigDto } from '../../shared/types/ipc'

export function useListExecutables(folderPath: string) {
  return useQuery<string[]>({
    queryKey: ['executables', folderPath],
    queryFn: () => window.api.launch.listExecutables(folderPath),
    enabled: folderPath !== '',
  })
}

export function useLocaleEmulatorAvailable() {
  return useQuery<boolean>({
    queryKey: ['locale-emulator-available'],
    queryFn: () => window.api.launch.isLocaleEmulatorAvailable(),
    staleTime: Infinity,
  })
}

export function useSetLaunchConfig() {
  return useMutation({
    mutationFn: ({
      entry,
      config,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      config: LaunchConfigDto
    }) => window.api.launch.setConfig(entry.code, entry.path, config),
  })
}

export function useLaunchGame() {
  return useMutation({
    mutationFn: (entry: Pick<ScannedEntry, 'code' | 'path'>) =>
      window.api.launch.launch(entry.code, entry.path),
  })
}
```

- [ ] **Step 2: `src/services/saveService.ts` 구현**

```ts
import { useMutation } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'

export function usePickSaveFolder() {
  return useMutation({ mutationFn: () => window.api.save.pickFolder() })
}

export function useSetSavePath() {
  return useMutation({
    mutationFn: ({
      entry,
      savePath,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      savePath: string
    }) => window.api.save.setPath(entry.code, entry.path, savePath),
  })
}

export function useBackupSaveNow() {
  return useMutation({
    mutationFn: (entry: Pick<ScannedEntry, 'code' | 'path'>) =>
      window.api.save.backupNow(entry.code, entry.path),
  })
}
```

- [ ] **Step 3: `src/components/game/LaunchConfigDialog.tsx` 구현**

실행파일 선택 + 실행방식 선택 + 세이브 폴더 지정을 한 다이얼로그에 묶는다(둘 다 "게임별 실행/저장 설정"이라는 같은 관심사이므로):

```tsx
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import {
  useListExecutables,
  useLocaleEmulatorAvailable,
  useSetLaunchConfig,
} from '../../services/launchService'
import { usePickSaveFolder, useSetSavePath } from '../../services/saveService'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { LaunchConfigDto } from '../../../shared/types/ipc'

interface LaunchConfigDialogProps {
  entry: ScannedEntry | null
  onClose: () => void
}

export function LaunchConfigDialog({ entry, onClose }: LaunchConfigDialogProps) {
  const folderPath = entry?.kind === 'folder' ? entry.path : ''
  const { data: executables } = useListExecutables(folderPath)
  const { data: leAvailable } = useLocaleEmulatorAvailable()
  const setLaunchConfig = useSetLaunchConfig()
  const pickSaveFolder = usePickSaveFolder()
  const setSavePath = useSetSavePath()

  const [selectedExe, setSelectedExe] = useState('')
  const [launchMode, setLaunchMode] = useState<LaunchConfigDto['launchMode']>('normal')

  const handleSaveLaunchConfig = (): void => {
    if (!entry || !selectedExe) return
    setLaunchConfig.mutate({ entry, config: { executablePath: selectedExe, launchMode } })
  }

  const handlePickSaveFolder = async (): Promise<void> => {
    if (!entry) return
    const path = await pickSaveFolder.mutateAsync()
    if (path) setSavePath.mutate({ entry, savePath: path })
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>실행/저장 설정 {entry ? `- ${entry.name}` : ''}</DialogTitle>
        </DialogHeader>

        {entry?.kind !== 'folder' && (
          <p className="text-sm text-muted-foreground">
            압축파일은 실행 설정을 지원하지 않습니다. 먼저 압축을 해제해 주세요.
          </p>
        )}

        {entry?.kind === 'folder' && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">실행파일</p>
              {(executables ?? []).map((exe) => (
                <label key={exe} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="executable"
                    checked={selectedExe === exe}
                    onChange={() => setSelectedExe(exe)}
                  />
                  {exe}
                </label>
              ))}
              {(executables ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">exe 파일을 찾을 수 없습니다.</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">실행 방식</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="launchMode"
                  checked={launchMode === 'normal'}
                  onChange={() => setLaunchMode('normal')}
                />
                일반 실행
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="launchMode"
                  checked={launchMode === 'locale-emulator'}
                  onChange={() => setLaunchMode('locale-emulator')}
                  disabled={!leAvailable}
                />
                Locale Emulator로 실행{!leAvailable && ' (설치되어 있지 않음)'}
              </label>
            </div>

            <Button onClick={handleSaveLaunchConfig} disabled={!selectedExe}>
              실행 설정 저장
            </Button>

            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm font-medium">세이브 파일 백업 위치</p>
              <Button variant="secondary" onClick={handlePickSaveFolder}>
                세이브 폴더 지정
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: `DetailOverlay.tsx`의 "실행" 버튼 연결**

`useState`(이미 D그룹에서 `평점/메모`용으로 import됨), `LaunchConfigDialog`, `useLaunchGame` import 추가:

```tsx
import { LaunchConfigDialog } from '../../components/game/LaunchConfigDialog'
import { useLaunchGame } from '../../services/launchService'
```

`DetailOverlay` 함수 안에 추가:

```tsx
  const [configuringLaunch, setConfiguringLaunch] = useState(false)
  const launchGame = useLaunchGame()
```

기존 "실행" 버튼(`console.log('launch', game.path)`)을 교체:

```tsx
              <Button
                variant="secondary"
                onClick={() => {
                  if (game.kind === 'folder') launchGame.mutate(game)
                }}
              >
                실행
              </Button>
              <Button variant="secondary" onClick={() => setConfiguringLaunch(true)}>
                실행 설정
              </Button>
```

`RatingMemoDialog` 렌더링 옆에 추가:

```tsx
      <LaunchConfigDialog
        entry={configuringLaunch ? game : null}
        onClose={() => setConfiguringLaunch(false)}
      />
```

주: "실행" 버튼은 이미 저장된 `launchConfig`가 없으면 Task 4의 IPC 핸들러가 에러를 던진다(`실행 설정이 없습니다`) — 이번 태스크에서는 그 에러를 사용자에게 토스트 등으로 보여주는 처리는 하지 않는다(에러 토스트 컴포넌트가 이 프로젝트에 아직 없음 — 범위 밖, 콘솔 에러로만 남는다는 것을 self-review에서 명시).

- [ ] **Step 5: 수동 검증 (CDP 또는 실제 앱)**

폴더 타입의 코드있는 항목에서 "실행 설정" → exe 선택 + 일반 실행 선택 → 저장 → "실행" 클릭 → 실제로 그 exe가 실행되는지 확인. 세이브 폴더 지정도 확인.

- [ ] **Step 6: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 모두 exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/services/launchService.ts src/services/saveService.ts src/components/game/LaunchConfigDialog.tsx src/pages/Explorer/DetailOverlay.tsx
git commit -m "feat: add launch config dialog, wire execute button, save folder picker"
```

---

### Task 7: 최근 플레이 탭

**Files:**
- Create: `electron/main/database/gameUserDataRepository.ts` 확장 (`listRecentlyPlayedKeys`)
- Modify: `electron/main/database/gameUserDataRepository.test.ts`
- Modify: `shared/types/ipc.ts`
- Modify: `electron/main/ipc/gameUserDataHandlers.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/services/gameUserDataService.ts`
- Create: `src/pages/RecentlyPlayed/RecentlyPlayedPage.tsx`
- Modify: `src/router.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Produces: `window.api.gameUserData.listRecentlyPlayed(): Promise<{ key: string; lastPlayedAt: string }[]>`, `useRecentlyPlayed()`.

**설계**: 즐겨찾기 탭(D그룹 Task 6)과 달리, 최근 플레이는 "게임 파일이 삭제돼도 계속 보여야 한다"는 요구사항(★2번)이 있으므로 라이브 스캔 결과와 매칭하지 않고 `game_metadata`의 캐시된 제목/커버 이미지를 그대로 사용한다. `game_metadata`가 아직 크롤링되지 않은(A그룹 미실행) 코드는 제목 대신 코드값을 표시한다.

- [ ] **Step 1: `gameUserDataRepository.ts`에 `listRecentlyPlayedKeys` 추가**

```ts
import { desc, isNotNull } from 'drizzle-orm'

export interface RecentlyPlayedEntry {
  key: string
  lastPlayedAt: string
}

export function listRecentlyPlayedKeys(db: AppDatabase, limit = 50): RecentlyPlayedEntry[] {
  return db
    .select({ key: gameUserData.key, lastPlayedAt: gameUserData.lastPlayedAt })
    .from(gameUserData)
    .where(isNotNull(gameUserData.lastPlayedAt))
    .orderBy(desc(gameUserData.lastPlayedAt))
    .limit(limit)
    .all()
    .map((row) => ({ key: row.key, lastPlayedAt: row.lastPlayedAt! }))
}
```

- [ ] **Step 2: `gameUserDataRepository.test.ts`에 실패하는 테스트 추가**

```ts
it('lists keys with a recorded play session, most recent first', () => {
  recordPlaySession(db, 'RJ01111111', 'code', 1000)
  recordPlaySession(db, 'RJ02222222', 'code', 1000)
  touchGameUserData(db, 'RJ03333333', 'code') // 플레이 기록 없음 - 제외돼야 함

  const recent = listRecentlyPlayedKeys(db)
  expect(recent.map((r) => r.key)).toEqual(['RJ02222222', 'RJ01111111'])
})
```

- [ ] **Step 3: 실행해서 실패 후 통과 확인**

Run: `npm run test -- electron/main/database/gameUserDataRepository.test.ts`
Expected: 먼저 FAIL → Step 1 반영 후 PASS, 17 tests.

- [ ] **Step 4: `shared/types/ipc.ts`에 채널 추가**

```ts
  GAME_USER_DATA_LIST_RECENTLY_PLAYED: 'game-user-data:list-recently-played',
```

- [ ] **Step 5: `gameUserDataHandlers.ts`에 핸들러 추가**

```ts
  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_LIST_RECENTLY_PLAYED, () => {
    return listRecentlyPlayedKeys(db)
  })
```

- [ ] **Step 6: `electron/preload/index.ts`에 API 추가**

```ts
    listRecentlyPlayed: (): Promise<{ key: string; lastPlayedAt: string }[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_LIST_RECENTLY_PLAYED),
```

- [ ] **Step 7: `src/services/gameUserDataService.ts`에 훅 추가**

```ts
export function useRecentlyPlayed() {
  return useQuery<{ key: string; lastPlayedAt: string }[]>({
    queryKey: ['game-user-data', 'recently-played'],
    queryFn: () => window.api.gameUserData.listRecentlyPlayed(),
  })
}
```

- [ ] **Step 8: `src/pages/RecentlyPlayed/RecentlyPlayedPage.tsx` 구현**

```tsx
import { useRecentlyPlayed } from '../../services/gameUserDataService'
import { useGameMetadata } from '../../services/metadataService'
import type { GameCode } from '../../../shared/types/scanner'

function codeFromKey(key: string): GameCode | null {
  const match = /^(RJ|VJ|ST)(\d+)$/.exec(key)
  if (!match) return null
  return { type: match[1] as GameCode['type'], value: key }
}

function RecentlyPlayedRow({ entryKey, lastPlayedAt }: { entryKey: string; lastPlayedAt: string }) {
  const code = codeFromKey(entryKey)
  const { data: metadata } = useGameMetadata(code)

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm">
      <span>{metadata?.title ?? entryKey}</span>
      <span className="text-xs text-muted-foreground">{lastPlayedAt.slice(0, 10)}</span>
    </div>
  )
}

export function RecentlyPlayedPage() {
  const { data: recent, isLoading } = useRecentlyPlayed()

  if (isLoading || !recent) return null

  if (recent.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        아직 플레이한 게임이 없습니다.
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {recent.map((entry) => (
        <RecentlyPlayedRow key={entry.key} entryKey={entry.key} lastPlayedAt={entry.lastPlayedAt} />
      ))}
    </div>
  )
}
```

**주**: `codeFromKey`는 경로 키(파일 경로 형태)에 대해 정규식이 매치하지 않아 `null`을 반환하고, 그 경우 `useGameMetadata(null)`이 `enabled: false`라 그냥 `entryKey`(경로 문자열)를 표시한다 — 코드없는 파일도 플레이 기록이 남을 수 있으므로 (Task 6의 실행 버튼은 `game.kind === 'folder'`인 모든 항목에 대해 동작하고, `entry.code`가 없어도 `resolveGameEntryKey`가 경로로 처리하기 때문) 이 경우를 깨지 않고 자연스럽게 처리된다.

- [ ] **Step 9: `src/router.tsx`에 라우트 추가**

```ts
const recentlyPlayedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recently-played',
  component: RecentlyPlayedPage,
})
```

`routeTree`의 `addChildren`에 추가.

- [ ] **Step 10: `src/components/layout/Sidebar.tsx`에 메뉴 추가**

`import { ... History } from 'lucide-react'`에 `History` 추가:

```ts
  { to: '/recently-played', label: '최근 플레이', icon: History },
```

- [ ] **Step 11: 수동 검증 (CDP 또는 실제 앱)**

게임을 하나 실행(Task 6)한 뒤 "최근 플레이" 탭에서 표시되는지 확인.

- [ ] **Step 12: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 모두 exit 0.

- [ ] **Step 13: Commit**

```bash
git add electron/main/database/gameUserDataRepository.ts electron/main/database/gameUserDataRepository.test.ts shared/types/ipc.ts electron/main/ipc/gameUserDataHandlers.ts electron/preload/index.ts src/services/gameUserDataService.ts src/pages/RecentlyPlayed/ src/router.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: add recently played tab"
```

---

### Task 8: 최종 검증

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

- [ ] **Step 2: Locale Emulator 불확실성 재확인**

Task 3에서 로컬 검증이 불가능했다면(LE 미설치), 이 시점에 다시 한번 확인 — 가능하면 실제 설치 후 검증. 여전히 불가능하면 최종 보고서에 "LEProc.exe 호출 문법은 커뮤니티 통상 사용법을 가정했을 뿐 공식 문서로 검증되지 않았다"는 사실을 명시적으로 남긴다.

- [ ] **Step 3: Commit** (Step 1에서 수정이 필요했을 때만)

```bash
git add -A
git commit -m "fix: address issues found in launch/playtime/save-backup verification pass"
```

---
