# DLsite 메타데이터 크롤링 및 검색 탭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RJ/VJ 코드로 DLsite 작품 페이지를 크롤링해 제목/서클명/발매일/장르/커버이미지를 `game_metadata`에 저장하고, 커버 이미지는 게임 파일과 분리된 캐시 디렉터리에 webp로 저장한다. 사이드바에 DLsite 검색 탭을 추가해 사용자가 직접 조회·저장할 수 있게 한다.

**Architecture:** main 프로세스에서 `fetch` + `cheerio`로 DLsite 작품 페이지 HTML을 가져와 파싱하는 순수 함수(`parseDlsiteWorkPage`)와 네트워크 호출 래퍼(`crawlGameMetadata`)를 분리한다. 파서는 실제 DLsite 페이지에서 캡처한 고정 fixture HTML로 테스트한다(네트워크에 의존하지 않음). 이미지는 Sharp로 webp 변환 후 `userData/cache/covers/{code}.webp`에 저장, `Task 1(선행작업 플랜)`의 `game_metadata` 테이블에 컬럼을 추가해 upsert.

**Tech Stack:** cheerio(신규), sharp(신규, 초기 설계에서 이미 선정되어 있었으나 미설치 상태였음), Node 내장 `fetch`

## Global Constraints

- TypeScript strict 모드, `npm run typecheck` 에러 0개.
- ESLint + Prettier 에러/경고 0개 (`npm run lint`, `npm run format:check`).
- SQL 접근은 Repository 모듈을 통해서만.
- 모든 신규 파일은 상대경로 import만 사용.
- 크롤러 파서(`parseDlsiteWorkPage`)는 고정 HTML fixture로 테스트 — 실제 네트워크 요청은 자동화 테스트에서 하지 않는다.
- 이미지 캐시는 게임 파일이 위치한 경로에 절대 쓰지 않는다 — 항상 `app.getPath('userData')/cache/covers/`.
- ST 코드는 DLsite가 아니라 Steam이므로 크롤링 대상이 아니다 — `crawlGameMetadata`는 ST 코드에 대해 네트워크 호출 없이 `null`을 반환한다.
- 선행 플랜(`2026-07-28-game-metadata-foundation-plan.md`)이 이미 구현되어 `game_metadata` 테이블과 `touchGameMetadata`/`getGameMetadata`가 존재한다고 가정한다.
- 스펙 참조: `docs/superpowers/specs/2026-07-28-game-management-expansion-design.md`.

---

### Task 1: DLsite 페이지 파서 (순수 함수)

**Files:**
- Create: `electron/main/metadata/dlsiteParser.ts`
- Create: `electron/main/metadata/__fixtures__/dlsite-work-page.html`
- Create: `electron/main/metadata/__fixtures__/dlsite-error-page.html`
- Test: `electron/main/metadata/dlsiteParser.test.ts`

**Interfaces:**
- Produces: `CrawledGameMetadata` 타입(`{ title, circle, releaseDate, genres, coverImageUrl }`), `parseDlsiteWorkPage(html: string): CrawledGameMetadata | null` — Task 2가 소비.

**셀렉터 근거**: 실제 DLsite 작품 페이지(RJ01169914, VJ01004728)를 직접 fetch해서 확인한 구조. `#work_name`(h1, itemprop="name"), `#work_maker .maker_name a`(서클/브랜드명 — 라벨 텍스트는 "サークル名"/"ブランド名"으로 카테고리별로 다르지만 셀렉터는 동일), `#work_outline` 테이블의 각 `tr`에서 `th` 텍스트로 "販売日"(발매일)/"ジャンル"(장르) 행을 찾음, `meta[property="og:image"]`(커버 이미지). 존재하지 않는 코드는 404 응답에 `#work_name`이 없는 별도 에러 페이지("該当作品がありません")를 반환함을 확인함.

- [ ] **Step 1: `cheerio` 설치**

Run: `npm install cheerio`
Expected: `package.json`의 `dependencies`에 `cheerio` 추가됨.

- [ ] **Step 2: 실제 페이지 구조를 반영한 fixture 작성**

`electron/main/metadata/__fixtures__/dlsite-work-page.html` 생성 (실제 RJ01169914 페이지에서 파서가 사용하는 부분만 발췌·단순화):

```html
<!DOCTYPE html>
<html>
<head>
  <meta property="og:image" content="https://img.dlsite.jp/modpub/images2/work/doujin/RJ01170000/RJ01169914_img_main.jpg">
</head>
<body>
  <h1 itemprop="name" id="work_name">シニシスタ2 SiNiSistar2</h1>
  <table id="work_maker">
    <tr>
      <th>サークル名</th>
      <td>
        <span itemprop="brand" class="maker_name">
          <a href="https://www.dlsite.com/maniax/circle/profile/=/maker_id/RG44365.html">ウー</a>
        </span>
      </td>
    </tr>
  </table>
  <table id="work_outline">
    <tr>
      <th>販売日</th>
      <td><a href="#">2025年04月12日</a></td>
    </tr>
    <tr>
      <th>更新情報</th>
      <td>2026年05月20日</td>
    </tr>
    <tr>
      <th>ジャンル</th>
      <td>
        <div class="main_genre">
          <a href="#">ドット</a>
          <a href="#">シスター</a>
          <a href="#">丸呑み</a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
```

`electron/main/metadata/__fixtures__/dlsite-error-page.html` 생성 (실제 존재하지 않는 코드 조회 시의 응답을 단순화):

```html
<!DOCTYPE html>
<html>
<head><title>エラー: 該当作品がありません</title></head>
<body>
  <p>お探しの作品は見つかりませんでした。</p>
</body>
</html>
```

- [ ] **Step 3: 실패하는 테스트 작성**

`electron/main/metadata/dlsiteParser.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseDlsiteWorkPage } from './dlsiteParser'

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, '__fixtures__', name), 'utf-8')
}

describe('parseDlsiteWorkPage', () => {
  it('extracts title, circle, release date, genres, and cover image from a real work page', async () => {
    const html = await loadFixture('dlsite-work-page.html')
    expect(parseDlsiteWorkPage(html)).toEqual({
      title: 'シニシスタ2 SiNiSistar2',
      circle: 'ウー',
      releaseDate: '2025-04-12',
      genres: ['ドット', 'シスター', '丸呑み'],
      coverImageUrl:
        'https://img.dlsite.jp/modpub/images2/work/doujin/RJ01170000/RJ01169914_img_main.jpg',
    })
  })

  it('returns null for a delisted/nonexistent-work error page', async () => {
    const html = await loadFixture('dlsite-error-page.html')
    expect(parseDlsiteWorkPage(html)).toBeNull()
  })
})
```

- [ ] **Step 4: 실행해서 실패 확인**

Run: `npm run test -- electron/main/metadata/dlsiteParser.test.ts`
Expected: FAIL — `dlsiteParser.ts` does not exist.

- [ ] **Step 5: `electron/main/metadata/dlsiteParser.ts` 구현**

```ts
import * as cheerio from 'cheerio'

export interface CrawledGameMetadata {
  title: string
  circle: string
  releaseDate: string // 'YYYY-MM-DD', 파싱 실패 시 빈 문자열
  genres: string[]
  coverImageUrl: string | null
}

function parseJapaneseDate(text: string): string {
  const match = /(\d+)年(\d+)月(\d+)日/.exec(text)
  if (!match) return ''
  const [, year, month, day] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

// DLsite 작품 페이지 HTML을 파싱한다. 삭제된/존재하지 않는 작품 페이지는
// #work_name이 없는 별도 에러 페이지를 반환하므로 이를 null 신호로 쓴다.
export function parseDlsiteWorkPage(html: string): CrawledGameMetadata | null {
  const $ = cheerio.load(html)
  const title = $('#work_name').text().trim()
  if (!title) return null

  const circle = $('#work_maker .maker_name a').first().text().trim()

  let releaseDate = ''
  let genres: string[] = []
  $('#work_outline tr').each((_, row) => {
    const label = $(row).find('th').text().trim()
    if (label === '販売日') {
      releaseDate = parseJapaneseDate($(row).find('td').text())
    } else if (label === 'ジャンル') {
      genres = $(row)
        .find('.main_genre a')
        .map((_i, el) => $(el).text().trim())
        .get()
    }
  })

  const coverImageUrl = $('meta[property="og:image"]').attr('content') ?? null

  return { title, circle, releaseDate, genres, coverImageUrl }
}
```

- [ ] **Step 6: 실행해서 통과 확인**

Run: `npm run test -- electron/main/metadata/dlsiteParser.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 7: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json electron/main/metadata/dlsiteParser.ts electron/main/metadata/dlsiteParser.test.ts electron/main/metadata/__fixtures__/dlsite-work-page.html electron/main/metadata/__fixtures__/dlsite-error-page.html
git commit -m "feat: add DLsite work-page parser with real-structure fixtures"
```

---

### Task 2: 크롤러 (네트워크 호출) 및 `game_metadata` 실제 컬럼

**Files:**
- Create: `electron/main/metadata/crawlGameMetadata.ts`
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/client.ts`
- Modify: `electron/main/database/gameMetadataRepository.ts`
- Test: `electron/main/database/gameMetadataRepository.test.ts`

**Interfaces:**
- Consumes: `parseDlsiteWorkPage` (Task 1), `GameCode` 타입(`shared/types/scanner.ts`).
- Produces: `crawlGameMetadata(code: GameCode): Promise<CrawledGameMetadata | null>`, `saveGameMetadata(db, code, data: CrawledGameMetadata)` — Task 4(IPC)가 소비.

- [ ] **Step 1: `electron/main/metadata/crawlGameMetadata.ts` 구현**

RJ/VJ URL 패턴 분기는 `electron/main/shell/buildExternalUrl.ts`에 이미 있는 것과 동일한 사실(`VJ`는 `/pro/`, 그 외는 `/maniax/`)이지만, 크롤러는 셸 오픈과 무관한 별도 관심사이므로 여기서 독립적으로 구현한다(같은 상수를 공유 모듈로 뽑는 것은 이번 범위 밖 — 두 값이 우연히 같을 뿐 결합할 이유가 없음).

```ts
import { parseDlsiteWorkPage, type CrawledGameMetadata } from './dlsiteParser'
import type { GameCode } from '../../../shared/types/scanner'

function workPageUrl(code: GameCode): string | null {
  if (code.type === 'ST') return null // Steam 작품 - DLsite 크롤링 대상 아님
  const category = code.type === 'VJ' ? 'pro' : 'maniax'
  return `https://www.dlsite.com/${category}/work/=/product_id/${code.value}.html`
}

export async function crawlGameMetadata(code: GameCode): Promise<CrawledGameMetadata | null> {
  const url = workPageUrl(code)
  if (!url) return null

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DLibrary/1.0' },
  })
  if (!response.ok) return null

  const html = await response.text()
  return parseDlsiteWorkPage(html)
}
```

- [ ] **Step 2: `electron/main/database/schema.ts`의 `gameMetadata`에 실제 컬럼 추가**

기존 정의를 찾아 컬럼을 추가(다른 테이블은 그대로 둠):

```ts
export const gameMetadata = sqliteTable('game_metadata', {
  code: text('code').primaryKey(),
  title: text('title'),
  circle: text('circle'),
  releaseDate: text('release_date'),
  genres: text('genres'), // JSON 배열 문자열로 저장
  coverImagePath: text('cover_image_path'), // Task 3에서 채움, 지금은 항상 null
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
```

- [ ] **Step 3: `electron/main/database/client.ts`의 `game_metadata` 생성 구문에 컬럼 추가**

```ts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS game_metadata (
      code TEXT PRIMARY KEY,
      title TEXT,
      circle TEXT,
      release_date TEXT,
      genres TEXT,
      cover_image_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
```

기존 배포에서 이미 생성된 `game_metadata` 테이블(컬럼 없는 버전)이 있으면 `CREATE TABLE IF NOT EXISTS`는 아무 효과가 없다 — 이 프로젝트는 아직 배포 전이므로 마이그레이션 스크립트는 만들지 않는다(다른 테이블들과 동일한 기존 관례).

- [ ] **Step 4: `gameMetadataRepository.test.ts`에 실패하는 테스트 추가**

기존 파일 끝에 추가:

```ts
import { saveGameMetadata } from './gameMetadataRepository'

// ... (describe 블록 내부, 기존 4개 테스트 뒤에 추가)

it('saves crawled metadata and reads it back with genres parsed as an array', () => {
  saveGameMetadata(db, 'RJ01169914', {
    title: 'シニシスタ2 SiNiSistar2',
    circle: 'ウー',
    releaseDate: '2025-04-12',
    genres: ['ドット', 'シスター'],
    coverImageUrl: 'https://img.dlsite.jp/example.jpg',
  })

  const row = getGameMetadata(db, 'RJ01169914')
  expect(row?.title).toBe('シニシスタ2 SiNiSistar2')
  expect(row?.genres).toEqual(['ドット', 'シスター'])
  expect(row?.coverImagePath).toBeNull()
})
```

- [ ] **Step 5: 실행해서 실패 확인**

Run: `npm run test -- electron/main/database/gameMetadataRepository.test.ts`
Expected: FAIL — `saveGameMetadata` does not exist, `getGameMetadata`가 아직 `genres`를 배열로 파싱하지 않음.

- [ ] **Step 6: `gameMetadataRepository.ts` 확장**

`getGameMetadata`/`GameMetadataRow`를 다음으로 교체하고 `saveGameMetadata`를 추가:

```ts
import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { gameMetadata } from './schema'
import type { CrawledGameMetadata } from '../metadata/crawlGameMetadata'

export interface GameMetadataRow {
  code: string
  title: string | null
  circle: string | null
  releaseDate: string | null
  genres: string[]
  coverImagePath: string | null
  createdAt: string
  updatedAt: string
}

export function getGameMetadata(db: AppDatabase, code: string): GameMetadataRow | undefined {
  const row = db.select().from(gameMetadata).where(eq(gameMetadata.code, code)).get()
  if (!row) return undefined
  return { ...row, genres: row.genres ? (JSON.parse(row.genres) as string[]) : [] }
}

export function touchGameMetadata(db: AppDatabase, code: string): void {
  const now = new Date().toISOString()
  db.insert(gameMetadata)
    .values({ code, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameMetadata.code, set: { updatedAt: now } })
    .run()
}

// 크롤링 결과를 저장한다. coverImagePath는 여기서 건드리지 않는다 - Task 3의
// 이미지 캐시 다운로드가 성공한 뒤 별도로 채운다 (크롤링 자체는 성공했지만
// 이미지 다운로드만 실패하는 경우를 구분하기 위함).
export function saveGameMetadata(
  db: AppDatabase,
  code: string,
  data: CrawledGameMetadata
): void {
  const now = new Date().toISOString()
  db.insert(gameMetadata)
    .values({
      code,
      title: data.title,
      circle: data.circle,
      releaseDate: data.releaseDate,
      genres: JSON.stringify(data.genres),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: gameMetadata.code,
      set: {
        title: data.title,
        circle: data.circle,
        releaseDate: data.releaseDate,
        genres: JSON.stringify(data.genres),
        updatedAt: now,
      },
    })
    .run()
}
```

- [ ] **Step 7: 실행해서 통과 확인**

Run: `npm run test -- electron/main/database/gameMetadataRepository.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 8: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 9: Commit**

```bash
git add electron/main/metadata/crawlGameMetadata.ts electron/main/database/schema.ts electron/main/database/client.ts electron/main/database/gameMetadataRepository.ts electron/main/database/gameMetadataRepository.test.ts
git commit -m "feat: add DLsite crawler network call and game_metadata real columns"
```

---

### Task 3: 이미지 캐시 (다운로드 + webp 변환)

**Files:**
- Create: `electron/main/metadata/cacheCoverImage.ts`
- Test: `electron/main/metadata/cacheCoverImage.test.ts`

**Interfaces:**
- Consumes: `sharp`.
- Produces: `cacheCoverImage(cacheDir: string, code: string, imageUrl: string): Promise<string | null>` — 성공 시 저장된 파일의 절대경로, 실패 시 `null`. Task 4(IPC)가 소비.

- [ ] **Step 1: `sharp` 설치**

Run: `npm install sharp`
Expected: `package.json`의 `dependencies`에 `sharp` 추가됨.

- [ ] **Step 2: 실패하는 테스트 작성**

`electron/main/metadata/cacheCoverImage.test.ts` 생성 — 실제 네트워크 대신 로컬에 작은 PNG를 만들어 `file://` URL로 캐싱을 검증한다(다운로드 로직 자체는 `fetch`이므로 `file://` 프로토콜은 `fetch`가 지원하지 않는다 — 대신 아주 작은 로컬 HTTP 서버를 띄워 검증):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { cacheCoverImage } from './cacheCoverImage'

describe('cacheCoverImage', () => {
  let server: Server
  let baseUrl: string
  let cacheDir: string

  beforeEach(async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer()

    server = createServer((req, res) => {
      if (req.url === '/missing.jpg') {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(png)
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('server not listening')
    baseUrl = `http://127.0.0.1:${address.port}`

    cacheDir = await mkdtemp(join(tmpdir(), 'dlibrary-cover-'))
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(cacheDir, { recursive: true, force: true })
  })

  it('downloads an image, converts it to webp, and saves it under cacheDir/code.webp', async () => {
    const savedPath = await cacheCoverImage(cacheDir, 'RJ01169914', `${baseUrl}/cover.jpg`)
    expect(savedPath).toBe(join(cacheDir, 'RJ01169914.webp'))
    const buffer = await readFile(savedPath!)
    expect(buffer.subarray(8, 12).toString('ascii')).toBe('WEBP')
  })

  it('returns null when the download fails', async () => {
    const savedPath = await cacheCoverImage(cacheDir, 'RJ00000000', `${baseUrl}/missing.jpg`)
    expect(savedPath).toBeNull()
  })
})
```

- [ ] **Step 3: 실행해서 실패 확인**

Run: `npm run test -- electron/main/metadata/cacheCoverImage.test.ts`
Expected: FAIL — `cacheCoverImage.ts` does not exist.

- [ ] **Step 4: `electron/main/metadata/cacheCoverImage.ts` 구현**

```ts
import { join } from 'node:path'
import sharp from 'sharp'

// 원본 이미지를 받아 webp로 변환해 cacheDir/{code}.webp에 저장한다. 게임
// 파일이 위치한 경로와는 완전히 분리된 디렉터리에만 쓴다 - 호출자가
// app.getPath('userData')/cache/covers 같은 캐시 전용 경로를 넘겨야 한다.
export async function cacheCoverImage(
  cacheDir: string,
  code: string,
  imageUrl: string
): Promise<string | null> {
  const response = await fetch(imageUrl)
  if (!response.ok) return null

  const buffer = Buffer.from(await response.arrayBuffer())
  const outputPath = join(cacheDir, `${code}.webp`)
  await sharp(buffer).webp().toFile(outputPath)
  return outputPath
}
```

- [ ] **Step 5: 실행해서 통과 확인**

Run: `npm run test -- electron/main/metadata/cacheCoverImage.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json electron/main/metadata/cacheCoverImage.ts electron/main/metadata/cacheCoverImage.test.ts
git commit -m "feat: add cover image download + webp cache conversion"
```

---

### Task 4: 크롤링 IPC 핸들러

**Files:**
- Modify: `shared/types/ipc.ts`
- Create: `electron/main/ipc/metadataHandlers.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Consumes: `crawlGameMetadata`(Task 2), `saveGameMetadata`/`getGameMetadata`(Task 2), `cacheCoverImage`(Task 3), `GameCodeSchema`(이미 `shared/types/ipc.ts`에 존재, Task 13 - shell 작업에서 추가됨).
- Produces: `window.api.metadata.crawlAndSave(code: GameCode): Promise<GameMetadataRow | null>`, `window.api.metadata.get(code: GameCode): Promise<GameMetadataRow | null>` — Task 6(검색 탭 UI)이 소비.

- [ ] **Step 1: `shared/types/ipc.ts`에 채널과 스키마 추가**

`IPC_CHANNELS`에 추가(기존 항목은 그대로 둠):

```ts
  METADATA_CRAWL_AND_SAVE: 'metadata:crawl-and-save',
  METADATA_GET: 'metadata:get',
```

파일 끝에 추가(기존 `GameCodeSchema`를 재사용):

```ts
export const CrawlAndSaveMetadataRequestSchema = z.object({
  code: GameCodeSchema,
})
export type CrawlAndSaveMetadataRequest = z.infer<typeof CrawlAndSaveMetadataRequestSchema>

export const GetMetadataRequestSchema = z.object({
  code: GameCodeSchema,
})
export type GetMetadataRequest = z.infer<typeof GetMetadataRequestSchema>

export interface GameMetadataDto {
  code: string
  title: string | null
  circle: string | null
  releaseDate: string | null
  genres: string[]
  coverImagePath: string | null
}
```

- [ ] **Step 2: `electron/main/ipc/metadataHandlers.ts` 생성**

```ts
import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import {
  CrawlAndSaveMetadataRequestSchema,
  GetMetadataRequestSchema,
  IPC_CHANNELS,
  type GameMetadataDto,
} from '../../../shared/types/ipc'
import { crawlGameMetadata } from '../metadata/crawlGameMetadata'
import { cacheCoverImage } from '../metadata/cacheCoverImage'
import {
  getGameMetadata,
  saveGameMetadata,
  setGameMetadataCoverPath,
} from '../database/gameMetadataRepository'
import type { AppDatabase } from '../database/client'

function toDto(row: ReturnType<typeof getGameMetadata>): GameMetadataDto | null {
  if (!row) return null
  return {
    code: row.code,
    title: row.title,
    circle: row.circle,
    releaseDate: row.releaseDate,
    genres: row.genres,
    coverImagePath: row.coverImagePath,
  }
}

export function registerMetadataHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.METADATA_GET, (_event, payload: unknown) => {
    const { code } = GetMetadataRequestSchema.parse(payload)
    return toDto(getGameMetadata(db, code.value))
  })

  ipcMain.handle(IPC_CHANNELS.METADATA_CRAWL_AND_SAVE, async (_event, payload: unknown) => {
    const { code } = CrawlAndSaveMetadataRequestSchema.parse(payload)

    const crawled = await crawlGameMetadata(code)
    if (!crawled) return null

    saveGameMetadata(db, code.value, crawled)

    if (crawled.coverImageUrl) {
      const cacheDir = join(app.getPath('userData'), 'cache', 'covers')
      const coverPath = await cacheCoverImage(cacheDir, code.value, crawled.coverImageUrl)
      if (coverPath) setGameMetadataCoverPath(db, code.value, coverPath)
    }

    return toDto(getGameMetadata(db, code.value))
  })
}
```

- [ ] **Step 3: `gameMetadataRepository.ts`에 `setGameMetadataCoverPath` 추가**

기존 파일에 함수 추가:

```ts
export function setGameMetadataCoverPath(db: AppDatabase, code: string, coverImagePath: string): void {
  db.update(gameMetadata)
    .set({ coverImagePath, updatedAt: new Date().toISOString() })
    .where(eq(gameMetadata.code, code))
    .run()
}
```

- [ ] **Step 4: `gameMetadataRepository.test.ts`에 실패하는 테스트 추가**

```ts
it('sets the cover image path independently of the crawled text fields', () => {
  saveGameMetadata(db, 'RJ01169914', {
    title: 'Test',
    circle: 'Test Circle',
    releaseDate: '2025-01-01',
    genres: [],
    coverImageUrl: null,
  })

  setGameMetadataCoverPath(db, 'RJ01169914', '/cache/covers/RJ01169914.webp')

  expect(getGameMetadata(db, 'RJ01169914')?.coverImagePath).toBe('/cache/covers/RJ01169914.webp')
})
```

- [ ] **Step 5: 실행해서 실패 후 통과 확인**

Run: `npm run test -- electron/main/database/gameMetadataRepository.test.ts`
Expected: 먼저 FAIL(`setGameMetadataCoverPath` 없음) → Step 3 반영 후 PASS, 6 tests.

- [ ] **Step 6: `electron/main/index.ts`에 핸들러 등록**

`import { registerMetadataHandlers } from './ipc/metadataHandlers'` 추가, `app.whenReady().then(...)` 안에서 기존 다섯 개 등록 호출 옆에 `registerMetadataHandlers(db)` 추가.

- [ ] **Step 7: `electron/preload/index.ts`에 API 노출**

`api` 객체에 추가:

```ts
  metadata: {
    crawlAndSave: (code: GameCode): Promise<GameMetadataDto | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_CRAWL_AND_SAVE, { code }),
    get: (code: GameCode): Promise<GameMetadataDto | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_GET, { code }),
  },
```

`import type { ... GameMetadataDto } from '../../shared/types/ipc'`를 기존 타입 import에 추가.

- [ ] **Step 8: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 9: Commit**

```bash
git add shared/types/ipc.ts electron/main/ipc/metadataHandlers.ts electron/main/index.ts electron/preload/index.ts electron/main/database/gameMetadataRepository.ts electron/main/database/gameMetadataRepository.test.ts
git commit -m "feat: add metadata crawl-and-save IPC handler"
```

---

### Task 5: 렌더러 서비스

**Files:**
- Create: `src/services/metadataService.ts`

**Interfaces:**
- Consumes: `window.api.metadata.crawlAndSave`/`get`(Task 4).
- Produces: `useCrawlGameMetadata()`(React Query mutation), `useGameMetadata(code: GameCode | null)`(React Query query) — Task 6(검색 탭 UI)이 소비.

- [ ] **Step 1: `src/services/metadataService.ts` 구현**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GameCode } from '../../shared/types/scanner'
import type { GameMetadataDto } from '../../shared/types/ipc'

function metadataQueryKey(code: GameCode) {
  return ['metadata', code.value] as const
}

export function useGameMetadata(code: GameCode | null) {
  return useQuery<GameMetadataDto | null>({
    queryKey: code ? metadataQueryKey(code) : ['metadata', 'none'],
    queryFn: () => window.api.metadata.get(code!),
    enabled: code !== null,
  })
}

export function useCrawlGameMetadata() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (code: GameCode) => window.api.metadata.crawlAndSave(code),
    onSuccess: (result, code) => {
      if (result) queryClient.setQueryData(metadataQueryKey(code), result)
    },
  })
}
```

- [ ] **Step 2: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/services/metadataService.ts
git commit -m "feat: add renderer service hooks for game metadata"
```

---

### Task 6: DLsite 검색 탭 UI

**Files:**
- Create: `src/pages/DlsiteSearch/DlsiteSearchPage.tsx`
- Modify: `src/router.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Test: `src/pages/DlsiteSearch/parseCodeInput.test.ts`
- Create: `src/pages/DlsiteSearch/parseCodeInput.ts`

**Interfaces:**
- Consumes: `useCrawlGameMetadata`/`useGameMetadata`(Task 5), `extractCode`(이미 존재, `electron/main/scanner/codeRecognition.ts`의 로직과 동일한 정규식을 렌더러에서도 써야 하므로 여기서는 별도의 작은 순수 함수로 재구현 — main/renderer 프로세스 경계를 넘길 수 없으므로 공유 모듈 재사용 대신 필요한 만큼만 재구현한다).
- Produces: `parseCodeInput(input: string): GameCode | null`(제목 검색과 코드 직접 입력을 구분).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/pages/DlsiteSearch/parseCodeInput.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest'
import { parseCodeInput } from './parseCodeInput'

describe('parseCodeInput', () => {
  it('recognizes an RJ code typed directly', () => {
    expect(parseCodeInput('RJ01169914')).toEqual({ type: 'RJ', value: 'RJ01169914' })
  })

  it('recognizes an RJ code case-insensitively', () => {
    expect(parseCodeInput('rj01169914')).toEqual({ type: 'RJ', value: 'RJ01169914' })
  })

  it('returns null for free-text title search input', () => {
    expect(parseCodeInput('シニシスタ2')).toBeNull()
  })
})
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `npm run test -- src/pages/DlsiteSearch/parseCodeInput.test.ts`
Expected: FAIL — `parseCodeInput.ts` does not exist.

- [ ] **Step 3: `src/pages/DlsiteSearch/parseCodeInput.ts` 구현**

```ts
import type { GameCode, GameCodeType } from '../../../shared/types/scanner'

const CODE_PATTERN = /^(RJ|VJ|ST)(\d+)$/i

// 입력이 RJ/VJ/ST 코드 형식이면 GameCode로, 아니면 null(자유 텍스트 제목
// 검색으로 취급)을 반환한다. electron/main/scanner/codeRecognition.ts의
// extractCode와 의도는 같지만 그쪽은 파일명 "안에서" 코드를 찾고 이쪽은
// 입력 "전체가" 코드인지 판별하므로 앵커(^...$)가 다르다 - 별도 구현.
export function parseCodeInput(input: string): GameCode | null {
  const trimmed = input.trim()
  const match = CODE_PATTERN.exec(trimmed)
  if (!match) return null
  const type = match[1].toUpperCase() as GameCodeType
  return { type, value: `${type}${match[2]}` }
}
```

- [ ] **Step 4: 실행해서 통과 확인**

Run: `npm run test -- src/pages/DlsiteSearch/parseCodeInput.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: `src/pages/DlsiteSearch/DlsiteSearchPage.tsx` 구현**

```tsx
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
```

주: "저장" 버튼을 별도로 두지 않은 이유 — `crawlAndSave.mutate(code)`가 검색 시점에 이미 크롤링과 동시에 `game_metadata`에 저장까지 수행한다(Task 4의 IPC 핸들러 참고). 검색 = 저장이므로 별도 확인 버튼은 불필요한 한 단계 추가일 뿐이라 넣지 않는다.

- [ ] **Step 6: `src/router.tsx`에 라우트 추가**

`import { DlsiteSearchPage } from './pages/DlsiteSearch/DlsiteSearchPage'` 추가, 기존 라우트들 사이에:

```ts
const dlsiteSearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dlsite-search',
  component: DlsiteSearchPage,
})
```

`routeTree`의 `addChildren` 배열에 `dlsiteSearchRoute` 추가(순서는 `settingsRoute` 앞).

- [ ] **Step 7: `src/components/layout/Sidebar.tsx`에 메뉴 추가**

`import { ... Search } from 'lucide-react'`에 `Search` 아이콘 추가. `navItems` 배열의 `settings` 항목 앞에 추가:

```ts
  { to: '/dlsite-search', label: 'DLsite 검색', icon: Search },
```

- [ ] **Step 8: 수동 검증 (CDP 또는 실제 앱)**

앱을 부팅하고 사이드바의 "DLsite 검색" 탭으로 이동, `RJ01169914`를 입력해 검색 — 실제 네트워크 요청이 나가고 제목/서클/발매일/장르가 표시되는지, `game_metadata` 테이블에 실제로 저장됐는지(`SELECT * FROM game_metadata`) 확인. 존재하지 않는 코드(`RJ00000000` 등)로도 검색해 "작품을 찾을 수 없습니다" 메시지가 뜨는지 확인.

- [ ] **Step 9: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 모두 exit 0.

- [ ] **Step 10: Commit**

```bash
git add src/pages/DlsiteSearch/ src/router.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: add DLsite search tab"
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
git commit -m "fix: address issues found in DLsite crawling verification pass"
```

---
