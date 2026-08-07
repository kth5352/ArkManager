# Backlog Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved August 8 backlog integration spec with isolated, testable changes across metadata, media, Explorer, tray behavior, and UI consistency.

**Architecture:** Keep Electron main-process code responsible for filesystem mutation, metadata crawling, tray lifecycle, and safe IPC boundaries. Keep renderer code responsible for UI state, query invalidation, playback display, lyrics rendering, and shared visual primitives. Move shared identity/path logic into pure utilities with Vitest coverage before wiring UI behavior to it.

**Tech Stack:** Electron 43, React 19, TypeScript, TanStack Query, Zustand, Radix/shadcn UI primitives, Framer Motion, better-sqlite3/Drizzle schema definitions, Vitest, ffmpeg-static/ffprobe-style validation.

## Global Constraints

- Do not replace the UI framework or theme system.
- Do not add automatic metadata retry loops after failures.
- Do not send external mirror/API requests unless the user has configured and enabled a provider in Settings.
- Audio cover writes must use backup, validation, restore-on-failure, and no shell-string command construction.
- WAV cover art support is best-effort and must preserve playability even when cover detection is weaker.
- Existing `VN...` visual novel semantics must remain compatible; add `VR...` for VNDB release IDs.
- File-list refresh must not reload the renderer and must not reset `mediaPlayerStore`.
- Explorer fixes must be local changes, not a second Explorer rewrite.

---

## File Structure

- Modify `shared/types/scanner.ts`: add `VR` game code type.
- Modify `shared/types/ipc.ts`: add `VR` to `GameCodeSchema`, add metadata failure/provider/media lyrics/media cover IPC schemas and channels.
- Modify `electron/main/scanner/codeRecognition.ts`: recognize `v####` and `r####` VNDB forms.
- Modify `src/pages/DlsiteSearch/parseCodeInput.ts`: parse direct `v####`, `r####`, `VN####`, and `VR####`.
- Modify `electron/main/shell/buildExternalUrl.ts`: route `VN` to VNDB visual novel URLs and `VR` to VNDB release URLs.
- Modify `electron/main/metadata/vndbClient.ts`: split VN and release crawling.
- Create `electron/main/metadata/dlsiteJsonFallback.ts`: DLsite JSON/API fallback adapters.
- Create `electron/main/metadata/externalMetadataProvider.ts`: configured external provider adapter.
- Create `electron/main/database/metadataFailuresRepository.ts`: failure storage.
- Modify `electron/main/database/client.ts` and `electron/main/database/schema.ts`: add metadata failure table.
- Modify `electron/main/metadata/crawlGameMetadata.ts`: run DLsite fallback chain for DLsite codes.
- Modify `electron/main/ipc/metadataHandlers.ts`: clear/replace failure state on manual crawl and return failure data.
- Modify `src/services/metadataService.ts`: expose metadata failure query for detail UI.
- Modify `src/components/game/DetailSidebar.tsx` and `src/components/game/DetailOverlay.tsx`: display refresh failure state.
- Modify `src/pages/Settings/SettingsPage.tsx`, `shared/types/ipc.ts`, `electron/preload/index.ts`, `src/services/settingsService.ts`: external provider settings.
- Modify `src/lib/filterFavorites.ts`: return representative favorites.
- Modify `src/lib/filterFavorites.test.ts`: cover duplicate grouping.
- Modify `src/components/layout/SearchHeader.tsx`: combine text and tag fields in one expandable control.
- Modify `src/services/fileOpsService.ts`: export scan invalidation helper.
- Modify `src/components/layout/PageToolbar.tsx`: add file-list refresh action.
- Modify `src/components/layout/SelectionToolbar.tsx` and `src/components/game/RenameDialog.tsx`: deactivate selection on rename completion.
- Create `src/lib/lrc.ts`: pure LRC parser and selector helpers.
- Create `src/lib/lrc.test.ts`: parser tests.
- Create `electron/main/media/lyrics.ts`: safe `.lrc` discovery/read.
- Create `electron/main/ipc/mediaLyricsHandlers.ts`: lyrics IPC.
- Modify `electron/preload/index.ts`: expose lyrics API.
- Modify `src/components/media/useMediaLyrics.ts`, `MediaTransportBar.tsx`, `FullscreenMediaOverlay.tsx`, `MediaPlayerBar.tsx`: lyrics UI.
- Create `electron/main/media/audioCover.ts`: backup/write/validate/restore pipeline.
- Create `electron/main/media/audioCover.test.ts`: pipeline tests with injected dependencies.
- Modify `electron/main/ipc/mediaThumbnailHandlers.ts`: write real audio cover for supported formats.
- Modify `src/services/mediaThumbnailService.ts` and `src/pages/Media/MediaPage.tsx`: route errors and refresh thumbnails after real writes.
- Modify `electron/main/index.ts`: tray lifecycle and close behavior.
- Create `src/lib/pathParent.ts`: parent path utility.
- Modify `src/lib/groupMovesByOriginalParent.ts`, `src/pages/Explorer/ExplorerPage.tsx`, `src/pages/Explorer/breadcrumb.ts`, `src/pages/Explorer/ExplorerSidebar.tsx`, `src/pages/Explorer/FolderView.tsx`, `src/pages/Explorer/TabBar.tsx`: Explorer fixes.
- Create `src/lib/appToast.ts`: Sonner wrapper/helper.
- Modify existing toast call sites in `src/services/fileOpsService.ts` and new metadata/media cover call sites.

---

### Task 1: VNDB Code Identity and Parsing

**Files:**
- Modify: `shared/types/scanner.ts`
- Modify: `shared/types/ipc.ts`
- Modify: `electron/main/scanner/codeRecognition.ts`
- Modify: `src/pages/DlsiteSearch/parseCodeInput.ts`
- Modify: `electron/main/shell/buildExternalUrl.ts`
- Test: `electron/main/scanner/codeRecognition.test.ts`
- Test: `src/pages/DlsiteSearch/parseCodeInput.test.ts`
- Test: `electron/main/shell/buildExternalUrl.test.ts`
- Test: `shared/types/ipc.test.ts`

**Interfaces:**
- Produces: `GameCodeType = 'RJ' | 'VJ' | 'ST' | 'VN' | 'VR' | 'GC'`.
- Produces: `parseCodeInput('r45775') -> { type: 'VR', value: 'VR45775' }`.
- Produces: `extractCode('[v17] title') -> { type: 'VN', value: 'VN17' }`.
- Produces: `buildExternalUrl({ type: 'VR', value: 'VR45775' }) -> https://vndb.org/r45775`.

- [ ] **Step 1: Write failing parser tests**

```ts
// src/pages/DlsiteSearch/parseCodeInput.test.ts
it('recognizes a VNDB visual novel id typed with v prefix', () => {
  expect(parseCodeInput('v45775')).toEqual({ type: 'VN', value: 'VN45775' })
})

it('recognizes a VNDB release id typed with r prefix', () => {
  expect(parseCodeInput('r45775')).toEqual({ type: 'VR', value: 'VR45775' })
})

it('recognizes a VR code typed directly', () => {
  expect(parseCodeInput('VR45775')).toEqual({ type: 'VR', value: 'VR45775' })
})
```

```ts
// electron/main/scanner/codeRecognition.test.ts
it('extracts a VNDB visual novel id from a filename', () => {
  expect(extractCode('[v45775] Game')).toEqual({ type: 'VN', value: 'VN45775' })
})

it('extracts a VNDB release id from a filename without mapping it to VN', () => {
  expect(extractCode('[r45775] Game')).toEqual({ type: 'VR', value: 'VR45775' })
})
```

```ts
// electron/main/shell/buildExternalUrl.test.ts
it('builds a VNDB release URL for VR codes', () => {
  expect(buildExternalUrl({ type: 'VR', value: 'VR45775' })).toBe('https://vndb.org/r45775')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/pages/DlsiteSearch/parseCodeInput.test.ts electron/main/scanner/codeRecognition.test.ts electron/main/shell/buildExternalUrl.test.ts`

Expected: failures showing `VR` is not accepted and `r45775` is not parsed.

- [ ] **Step 3: Update shared code type schemas**

```ts
// shared/types/scanner.ts
export type GameCodeType = 'RJ' | 'VJ' | 'ST' | 'VN' | 'VR' | 'GC'
```

```ts
// shared/types/ipc.ts
export const GameCodeSchema = z.object({
  type: z.enum(['RJ', 'VJ', 'ST', 'VN', 'VR', 'GC']),
  value: z.string(),
})
```

- [ ] **Step 4: Update scanner recognition**

```ts
const CODE_PATTERN = /(?<![A-Za-z0-9])((?:RJ|VJ|ST|VN|VR|GC)\d+|[vr]\d+)(?![0-9])/i

export function extractCode(name: string): GameCode | null {
  const match = CODE_PATTERN.exec(name)
  if (!match) return null
  const raw = match[1]
  const lower = raw.toLowerCase()
  if (lower.startsWith('v') && !lower.startsWith('vn')) {
    return { type: 'VN', value: `VN${raw.slice(1)}` }
  }
  if (lower.startsWith('r') && !lower.startsWith('rj')) {
    return { type: 'VR', value: `VR${raw.slice(1)}` }
  }
  const type = raw.slice(0, 2).toUpperCase() as GameCodeType
  return { type, value: `${type}${raw.slice(2)}` }
}
```

- [ ] **Step 5: Update direct input parser**

```ts
const CODE_PATTERN = /^(RJ|VJ|ST|VN|VR|GC)(\d+)$/i
const VNDB_SHORT_PATTERN = /^([vr])(\d+)$/i

export function parseCodeInput(input: string): GameCode | null {
  const trimmed = input.trim()
  const short = VNDB_SHORT_PATTERN.exec(trimmed)
  if (short) {
    const type = short[1].toLowerCase() === 'v' ? 'VN' : 'VR'
    return { type, value: `${type}${short[2]}` }
  }
  const match = CODE_PATTERN.exec(trimmed)
  if (!match) return null
  const type = match[1].toUpperCase() as GameCodeType
  return { type, value: `${type}${match[2]}` }
}
```

- [ ] **Step 6: Update external URL builder**

```ts
if (code.type === 'VN') return `https://vndb.org/v${code.value.slice(2)}`
if (code.type === 'VR') return `https://vndb.org/r${code.value.slice(2)}`
```

- [ ] **Step 7: Run tests to verify pass**

Run: `npm test -- src/pages/DlsiteSearch/parseCodeInput.test.ts electron/main/scanner/codeRecognition.test.ts electron/main/shell/buildExternalUrl.test.ts shared/types/ipc.test.ts`

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add shared/types/scanner.ts shared/types/ipc.ts electron/main/scanner/codeRecognition.ts src/pages/DlsiteSearch/parseCodeInput.ts electron/main/shell/buildExternalUrl.ts electron/main/scanner/codeRecognition.test.ts src/pages/DlsiteSearch/parseCodeInput.test.ts electron/main/shell/buildExternalUrl.test.ts shared/types/ipc.test.ts
git commit -m "fix: separate VNDB visual novel and release ids"
```

---

### Task 2: VNDB Release Crawling

**Files:**
- Modify: `electron/main/metadata/vndbClient.ts`
- Modify: `electron/main/metadata/crawlGameMetadata.ts`
- Test: `electron/main/metadata/vndbClient.test.ts`
- Fixture: `electron/main/metadata/__fixtures__/vndb-release-response.json`

**Interfaces:**
- Consumes: `GameCode` with `type: 'VN' | 'VR'`.
- Produces: `toVndbId({ type: 'VR', value: 'VR45775' }) === 'r45775'`.
- Produces: `crawlVndb` dispatches `VN` to `https://api.vndb.org/kana/vn` and `VR` to `https://api.vndb.org/kana/release`.

- [ ] **Step 1: Write failing release mapping tests**

```ts
// electron/main/metadata/vndbClient.test.ts
import { mapReleaseToMetadata, toVndbId } from './vndbClient'

it('maps app VR code to VNDB release id', () => {
  expect(toVndbId({ type: 'VR', value: 'VR45775' })).toBe('r45775')
})

it('maps a VNDB release response to metadata without changing identity', () => {
  expect(
    mapReleaseToMetadata({
      id: 'r45775',
      title: 'Release Title',
      released: '2024-01-02',
      producers: [{ developer: true, name: 'Release Developer' }],
      vns: [{ title: 'Fallback VN Title', image: { url: 'https://t.vndb.org/cv/1.jpg' } }],
    })
  ).toEqual({
    title: 'Release Title',
    circle: 'Release Developer',
    releaseDate: '2024-01-02',
    genres: [],
    coverImageUrl: 'https://t.vndb.org/cv/1.jpg',
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- electron/main/metadata/vndbClient.test.ts`

Expected: `mapReleaseToMetadata` and exported `toVndbId` do not exist.

- [ ] **Step 3: Export and generalize VNDB ID conversion**

```ts
export function toVndbId(code: GameCode): string {
  if (code.type === 'VR') return `r${code.value.slice(2)}`
  return `v${code.value.slice(2)}`
}
```

- [ ] **Step 4: Add release API types and mapper**

```ts
interface VndbApiRelease {
  id: string
  title: string
  released: string | null
  producers: { name: string; developer: boolean }[]
  vns: { title: string; image: { url: string } | null }[]
}

export function mapReleaseToMetadata(release: VndbApiRelease): CrawledGameMetadata {
  return {
    title: release.title || release.vns[0]?.title || release.id,
    circle: release.producers.find((producer) => producer.developer)?.name ?? release.producers[0]?.name ?? '',
    releaseDate: release.released ?? '',
    genres: [],
    coverImageUrl: release.vns[0]?.image?.url ?? null,
  }
}
```

- [ ] **Step 5: Split crawl endpoints**

```ts
const VNDB_VN_API_URL = 'https://api.vndb.org/kana/vn'
const VNDB_RELEASE_API_URL = 'https://api.vndb.org/kana/release'

export async function crawlVndb(code: GameCode): Promise<CrawledGameMetadata | null> {
  return code.type === 'VR' ? crawlVndbRelease(code) : crawlVndbVn(code)
}
```

For release requests, use fields: `title, released, producers.name, producers.developer, vns.title, vns.image.url`.

- [ ] **Step 6: Keep crawlGameMetadata dispatch explicit**

```ts
if (code.type === 'VN' || code.type === 'VR') return crawlVndb(code)
```

- [ ] **Step 7: Run tests to verify pass**

Run: `npm test -- electron/main/metadata/vndbClient.test.ts`

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add electron/main/metadata/vndbClient.ts electron/main/metadata/vndbClient.test.ts electron/main/metadata/crawlGameMetadata.ts electron/main/metadata/__fixtures__/vndb-release-response.json
git commit -m "feat: crawl VNDB release metadata"
```

---

### Task 3: Metadata Failure Storage and DLsite Fallback Chain

**Files:**
- Create: `electron/main/database/metadataFailuresRepository.ts`
- Test: `electron/main/database/metadataFailuresRepository.test.ts`
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/client.ts`
- Create: `electron/main/metadata/dlsiteJsonFallback.ts`
- Test: `electron/main/metadata/dlsiteJsonFallback.test.ts`
- Create: `electron/main/metadata/externalMetadataProvider.ts`
- Test: `electron/main/metadata/externalMetadataProvider.test.ts`
- Modify: `electron/main/metadata/crawlGameMetadata.ts`
- Test: `electron/main/metadata/crawlGameMetadata.test.ts`

**Interfaces:**
- Produces: `saveMetadataFailure(db, code, attemptedSources, reason)`.
- Produces: `clearMetadataFailure(db, code)`.
- Produces: `crawlGameMetadata(code, deps?)` tries DLsite HTML, DLsite JSON, then enabled external provider for `RJ`/`VJ`.

- [ ] **Step 1: Write failing repository tests**

```ts
it('saves, replaces, reads, and clears metadata failure state', () => {
  const db = createDbClient(':memory:')
  saveMetadataFailure(db, 'RJ01494021', ['dlsite-html'], 'blocked')
  expect(getMetadataFailure(db, 'RJ01494021')).toMatchObject({
    code: 'RJ01494021',
    attemptedSources: ['dlsite-html'],
    reason: 'blocked',
  })

  saveMetadataFailure(db, 'RJ01494021', ['dlsite-html', 'dlsite-json'], 'parse')
  expect(getMetadataFailure(db, 'RJ01494021')?.attemptedSources).toEqual([
    'dlsite-html',
    'dlsite-json',
  ])

  clearMetadataFailure(db, 'RJ01494021')
  expect(getMetadataFailure(db, 'RJ01494021')).toBeUndefined()
})
```

- [ ] **Step 2: Run repository test to verify fail**

Run: `npm test -- electron/main/database/metadataFailuresRepository.test.ts`

Expected: repository module does not exist.

- [ ] **Step 3: Add schema and client DDL**

```ts
export const metadataFailures = sqliteTable('metadata_failures', {
  code: text('code').primaryKey(),
  attemptedSources: text('attempted_sources').notNull(),
  reason: text('reason').notNull(),
  updatedAt: text('updated_at').notNull(),
})
```

Add matching `CREATE TABLE IF NOT EXISTS metadata_failures (...)` in `client.ts`.

- [ ] **Step 4: Implement repository**

```ts
export type MetadataFailureReason = 'not_found' | 'blocked' | 'network' | 'parse' | 'provider_error'

export function saveMetadataFailure(
  db: AppDatabase,
  code: string,
  attemptedSources: string[],
  reason: MetadataFailureReason
): void {
  const now = new Date().toISOString()
  db.insert(metadataFailures)
    .values({ code, attemptedSources: JSON.stringify(attemptedSources), reason, updatedAt: now })
    .onConflictDoUpdate({
      target: metadataFailures.code,
      set: { attemptedSources: JSON.stringify(attemptedSources), reason, updatedAt: now },
    })
    .run()
}
```

- [ ] **Step 5: Write failing DLsite JSON adapter tests**

```ts
it('maps product JSON data to CrawledGameMetadata', () => {
  expect(
    mapDlsiteJsonToMetadata({
      work_name: 'Title',
      maker_name: 'Circle',
      regist_date: '2024-01-02',
      genres: [{ name: 'ADV' }],
      image_main: '//img.dlsite.jp/modpub/images2/work/doujin/RJ000/RJ000001_img_main.jpg',
    })
  ).toEqual({
    title: 'Title',
    circle: 'Circle',
    releaseDate: '2024-01-02',
    genres: ['ADV'],
    coverImageUrl: 'https://img.dlsite.jp/modpub/images2/work/doujin/RJ000/RJ000001_img_main.jpg',
  })
})
```

- [ ] **Step 6: Implement DLsite JSON fallback module**

```ts
export async function crawlDlsiteJsonFallback(code: GameCode): Promise<CrawledGameMetadata | null> {
  for (const url of dlsiteJsonUrls(code)) {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    })
    if (!response.ok) continue
    const metadata = mapDlsiteJsonToMetadata(await response.json())
    if (metadata) return metadata
  }
  return null
}
```

- [ ] **Step 7: Write failing fallback-chain test**

```ts
it('tries html then json then enabled external provider for DLsite codes', async () => {
  const calls: string[] = []
  const result = await crawlGameMetadata(
    { type: 'RJ', value: 'RJ01494021' },
    {
      crawlDlsiteHtml: async () => {
        calls.push('html')
        return null
      },
      crawlDlsiteJson: async () => {
        calls.push('json')
        return null
      },
      crawlExternal: async () => {
        calls.push('external')
        return {
          title: 'External Title',
          circle: '',
          releaseDate: '',
          genres: [],
          coverImageUrl: null,
        }
      },
    }
  )

  expect(calls).toEqual(['html', 'json', 'external'])
  expect(result?.title).toBe('External Title')
})
```

- [ ] **Step 8: Refactor `crawlGameMetadata` with dependency injection**

```ts
export interface CrawlGameMetadataDeps {
  crawlDlsiteHtml: (code: GameCode) => Promise<CrawledGameMetadata | null>
  crawlDlsiteJson: (code: GameCode) => Promise<CrawledGameMetadata | null>
  crawlExternal: (code: GameCode) => Promise<CrawledGameMetadata | null>
}

export async function crawlGameMetadata(
  code: GameCode,
  deps: CrawlGameMetadataDeps = defaultDeps
): Promise<CrawledGameMetadata | null> {
  if (code.type === 'ST') return crawlSteam(code)
  if (code.type === 'VN' || code.type === 'VR') return crawlVndb(code)
  if (code.type === 'GC') return crawlGetchu(code)
  const html = await deps.crawlDlsiteHtml(code)
  if (html) return html
  const json = await deps.crawlDlsiteJson(code)
  if (json) return json
  return deps.crawlExternal(code)
}
```

- [ ] **Step 9: Wire metadata handler failure persistence**

In `METADATA_CRAWL_AND_SAVE`:

```ts
clearMetadataFailure(db, code.value)
const crawled = await crawlGameMetadata(code)
if (!crawled) {
  saveMetadataFailure(db, code.value, attemptedSourcesFromLastCrawl, 'blocked')
  return null
}
saveGameMetadata(db, code.value, crawled)
clearMetadataFailure(db, code.value)
```

Implement a structured internal result so the handler can persist exact attempts:

```ts
export interface CrawlTraceResult {
  metadata: CrawledGameMetadata | null
  attemptedSources: string[]
  reason: MetadataFailureReason | null
}

export async function crawlGameMetadataWithTrace(
  code: GameCode,
  deps: CrawlGameMetadataDeps = defaultDeps
): Promise<CrawlTraceResult>
```

Keep `crawlGameMetadata(code, deps)` as a compatibility wrapper that returns
`(await crawlGameMetadataWithTrace(code, deps)).metadata`.

- [ ] **Step 10: Run tests**

Run: `npm test -- electron/main/database/metadataFailuresRepository.test.ts electron/main/metadata/dlsiteJsonFallback.test.ts electron/main/metadata/externalMetadataProvider.test.ts electron/main/metadata/crawlGameMetadata.test.ts`

Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add electron/main/database/schema.ts electron/main/database/client.ts electron/main/database/metadataFailuresRepository.ts electron/main/database/metadataFailuresRepository.test.ts electron/main/metadata/dlsiteJsonFallback.ts electron/main/metadata/dlsiteJsonFallback.test.ts electron/main/metadata/externalMetadataProvider.ts electron/main/metadata/externalMetadataProvider.test.ts electron/main/metadata/crawlGameMetadata.ts electron/main/metadata/crawlGameMetadata.test.ts electron/main/ipc/metadataHandlers.ts
git commit -m "feat: add metadata refresh fallback chain"
```

---

### Task 4: External Metadata Provider Settings and Failure UI

**Files:**
- Modify: `shared/types/ipc.ts`
- Modify: `electron/preload/index.ts`
- Modify: `electron/main/ipc/settingsHandlers.ts`
- Modify: `electron/main/database/settingsRepository.ts`
- Modify: `src/services/settingsService.ts`
- Modify: `src/pages/Settings/SettingsPage.tsx`
- Modify: `src/services/metadataService.ts`
- Modify: `src/components/game/DetailSidebar.tsx`
- Modify: `src/components/game/DetailOverlay.tsx`

**Interfaces:**
- Produces settings keys: `external-metadata-provider-enabled`, `external-metadata-provider-url`, `external-metadata-provider-api-key`.
- Produces renderer hooks: `useExternalMetadataProviderSettings`, `useSetExternalMetadataProviderSettings`.
- Produces metadata failure display via `useMetadataFailure(code)`.

- [ ] **Step 1: Write setting schema tests for the new keys**

```ts
it('accepts external metadata provider setting keys', () => {
  expect(SettingKeySchema.parse('external-metadata-provider-enabled')).toBe(
    'external-metadata-provider-enabled'
  )
  expect(SettingKeySchema.parse('external-metadata-provider-url')).toBe(
    'external-metadata-provider-url'
  )
  expect(SettingKeySchema.parse('external-metadata-provider-api-key')).toBe(
    'external-metadata-provider-api-key'
  )
})
```

- [ ] **Step 2: Run schema test to verify fail**

Run: `npm test -- shared/types/ipc.test.ts`

Expected: new setting keys are rejected.

- [ ] **Step 3: Extend `SettingKeySchema`**

```ts
'external-metadata-provider-enabled',
'external-metadata-provider-url',
'external-metadata-provider-api-key',
```

- [ ] **Step 4: Add preload/settings service methods**

```ts
getExternalMetadataProviderEnabled: (): Promise<boolean> =>
  ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'external-metadata-provider-enabled' })
    .then((value: string | null) => value === 'true'),
setExternalMetadataProviderEnabled: (enabled: boolean): Promise<void> =>
  ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, {
    key: 'external-metadata-provider-enabled',
    value: String(enabled),
  }),
```

Add matching URL and API key getters/setters.

- [ ] **Step 5: Add Settings UI**

In `SettingsPage.tsx`, add a compact section:

```tsx
<section className="flex flex-col gap-3">
  <div>
    <h2 className="text-sm font-medium">{t('settings.externalMetadataProvider')}</h2>
    <p className="text-xs text-muted-foreground">
      {t('settings.externalMetadataProviderDesc')}
    </p>
  </div>
  <label className="flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      checked={enabled}
      onChange={(event) => setEnabled.mutate(event.target.checked)}
    />
    {t('settings.enableExternalMetadataProvider')}
  </label>
  <Input value={url} onChange={(event) => setUrlDraft(event.target.value)} />
  <Input value={apiKey} onChange={(event) => setApiKeyDraft(event.target.value)} />
</section>
```

Use existing button/input spacing from the same page.

- [ ] **Step 6: Add metadata failure query IPC**

Add `METADATA_GET_FAILURE` request `{ code }` returning `{ code, attemptedSources, reason, updatedAt } | null`.

- [ ] **Step 7: Show failure state under refresh controls**

In detail views:

```tsx
{metadataFailure && !crawlMetadata.isPending && (
  <p className="text-xs text-destructive">
    {t('game.metadataRefreshFailed')}
  </p>
)}
```

- [ ] **Step 8: Run typecheck and targeted tests**

Run: `npm run typecheck`

Expected: no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add shared/types/ipc.ts electron/preload/index.ts electron/main/ipc/settingsHandlers.ts src/services/settingsService.ts src/pages/Settings/SettingsPage.tsx src/services/metadataService.ts src/components/game/DetailSidebar.tsx src/components/game/DetailOverlay.tsx src/i18n/translations.ts
git commit -m "feat: configure external metadata provider"
```

---

### Task 5: Favorites Representative Deduplication

**Files:**
- Modify: `src/lib/filterFavorites.ts`
- Modify: `src/lib/filterFavorites.test.ts`
- Modify: `src/pages/Favorites/FavoritesPage.tsx`

**Interfaces:**
- Produces: `filterFavorites<T extends Pick<ScannedEntry, 'code' | 'path' | 'kind' | 'mtimeMs' | 'name'>>(games, favoriteKeys): T[]`.

- [ ] **Step 1: Write failing tests**

```ts
it('collapses coded favorite duplicates to one representative', () => {
  const folder = entry({
    name: 'Folder',
    path: 'D:\\Games\\RJ01234567',
    kind: 'folder',
    mtimeMs: 10,
    code: { type: 'RJ', value: 'RJ01234567' },
  })
  const archive = entry({
    name: 'Archive.zip',
    path: 'D:\\Games\\RJ01234567.zip',
    kind: 'file',
    mtimeMs: 20,
    code: { type: 'RJ', value: 'RJ01234567' },
  })

  expect(filterFavorites([archive, folder], ['RJ01234567'])).toEqual([folder])
})

it('keeps code-less favorites path-specific', () => {
  const a = entry({ path: 'D:\\Games\\A', code: null, kind: 'folder', mtimeMs: 1 })
  const b = entry({ path: 'D:\\Games\\B', code: null, kind: 'folder', mtimeMs: 2 })

  expect(filterFavorites([a, b], ['d:\\games\\a', 'd:\\games\\b'])).toEqual([a, b])
})
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test -- src/lib/filterFavorites.test.ts`

Expected: duplicate coded entries both appear.

- [ ] **Step 3: Implement representative selection**

```ts
function scoreEntry(entry: Pick<ScannedEntry, 'kind' | 'name' | 'mtimeMs'>): [number, number, number] {
  const folderScore = entry.kind === 'folder' ? 1 : 0
  const archiveScore = isArchiveFile(entry.name) ? 0 : 1
  return [folderScore, archiveScore, entry.mtimeMs]
}

function isBetterRepresentative<T extends FavoriteEntry>(candidate: T, current: T): boolean {
  const a = scoreEntry(candidate)
  const b = scoreEntry(current)
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return normalizeLibraryPath(candidate.path) < normalizeLibraryPath(current.path)
}
```

- [ ] **Step 4: Group coded favorites**

```ts
const byCode = new Map<string, T>()
const pathFavorites: T[] = []
for (const game of games) {
  if (game.code) {
    if (!favoriteKeySet.has(game.code.value)) continue
    const current = byCode.get(game.code.value)
    if (!current || isBetterRepresentative(game, current)) byCode.set(game.code.value, game)
  } else if (favoriteKeySet.has(normalizeLibraryPath(game.path))) {
    pathFavorites.push(game)
  }
}
return [...byCode.values(), ...pathFavorites]
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/lib/filterFavorites.test.ts`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/filterFavorites.ts src/lib/filterFavorites.test.ts src/pages/Favorites/FavoritesPage.tsx
git commit -m "fix: show one card per favorite game"
```

---

### Task 6: Search Header, File Refresh, and Batch Rename Selection Cleanup

**Files:**
- Modify: `src/components/layout/SearchHeader.tsx`
- Modify: `src/components/layout/PageToolbar.tsx`
- Modify: `src/services/fileOpsService.ts`
- Modify: `src/components/layout/SelectionToolbar.tsx`
- Modify: `src/components/game/RenameDialog.tsx`
- Test: `src/stores/selectionStore.test.ts`

**Interfaces:**
- Produces: `invalidateFileListQueries(queryClient)`.
- Produces: `RenameDialog` optional prop `onCompleted?: () => void`.

- [ ] **Step 1: Extract and export scan invalidation helper**

```ts
export function invalidateFileListQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['games'] })
  queryClient.invalidateQueries({ queryKey: ['folder-scan'] })
  queryClient.invalidateQueries({ queryKey: ['folder-scan-recursive'] })
}
```

Use this helper in rename/delete/move success paths.

- [ ] **Step 2: Add refresh button to `PageToolbar`**

Add props:

```ts
onRefresh?: () => void
isRefreshing?: boolean
```

Render:

```tsx
{onRefresh && (
  <Button variant="ghost" size="icon" aria-label={t('pageToolbar.refreshFiles')} onClick={onRefresh}>
    <RefreshCw className="h-4 w-4" />
  </Button>
)}
```

- [ ] **Step 3: Wire refresh in Gallery/List/DetailList/Explorer where `PageToolbar` is used**

Use:

```ts
const queryClient = useQueryClient()
const refreshFiles = (): void => invalidateFileListQueries(queryClient)
```

Do not touch `mediaPlayerStore`.

- [ ] **Step 4: Rewrite `SearchHeader` expandable group**

Use one wrapper with `onFocusCapture` and `onBlurCapture`:

```tsx
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
  <button type="button" ...><Search className="h-4 w-4" /></button>
  <Input ref={inputRef} ... />
  <div className="h-4 w-px bg-border" />
  <Input value={genreInput} ... />
</div>
```

Remove the standalone tag `Input`.

- [ ] **Step 5: Add rename completion prop**

```ts
interface RenameDialogProps {
  targets: ScannedEntry[]
  onClose: () => void
  onCompleted?: () => void
}
```

In `handleApply`:

```ts
renameEntries.mutate(renames, {
  onSuccess: (nextResults) => {
    setResults(nextResults)
    onCompleted?.()
  },
})
```

In `SelectionToolbar`:

```tsx
<RenameDialog
  ...
  onCompleted={deactivate}
  onClose={closeDialog}
/>
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm run typecheck`

Run: `npm test -- src/stores/selectionStore.test.ts`

Expected: pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/SearchHeader.tsx src/components/layout/PageToolbar.tsx src/services/fileOpsService.ts src/components/layout/SelectionToolbar.tsx src/components/game/RenameDialog.tsx src/i18n/translations.ts
git commit -m "fix: refresh files without interrupting playback"
```

---

### Task 7: LRC Lyrics Parsing, Safe IPC, and Player UI

**Files:**
- Create: `src/lib/lrc.ts`
- Create: `src/lib/lrc.test.ts`
- Create: `electron/main/media/lyrics.ts`
- Create: `electron/main/media/lyrics.test.ts`
- Create: `electron/main/ipc/mediaLyricsHandlers.ts`
- Modify: `electron/main/index.ts`
- Modify: `shared/types/ipc.ts`
- Modify: `electron/preload/index.ts`
- Create: `src/services/mediaLyricsService.ts`
- Create: `src/components/media/useMediaLyrics.ts`
- Modify: `src/components/media/MediaTransportBar.tsx`
- Modify: `src/components/media/FullscreenMediaOverlay.tsx`
- Modify: `src/components/media/MediaPlayerBar.tsx`

**Interfaces:**
- Produces: `parseLrc(text): ParsedLyrics`.
- Produces: `getActiveLyricLine(parsed, currentTime): LyricLine | null`.
- Produces IPC: `media:get-lyrics` with `{ filePath } -> { text, path } | null`.

- [ ] **Step 1: Write failing LRC parser tests**

```ts
it('parses synced LRC timestamps', () => {
  expect(parseLrc('[00:10.50]hello')).toEqual({
    kind: 'synced',
    lines: [{ time: 10.5, text: 'hello' }],
  })
})

it('parses multiple timestamps on one line', () => {
  expect(parseLrc('[00:01.00][00:02.00]repeat').lines).toEqual([
    { time: 1, text: 'repeat' },
    { time: 2, text: 'repeat' },
  ])
})

it('returns static lyrics when no timestamp exists', () => {
  expect(parseLrc('line one\\nline two')).toEqual({
    kind: 'static',
    lines: ['line one', 'line two'],
  })
})
```

- [ ] **Step 2: Run parser tests to verify fail**

Run: `npm test -- src/lib/lrc.test.ts`

Expected: module missing.

- [ ] **Step 3: Implement parser**

```ts
export interface SyncedLyricLine {
  time: number
  text: string
}

export type ParsedLyrics =
  | { kind: 'synced'; lines: SyncedLyricLine[] }
  | { kind: 'static'; lines: string[] }

const TIMESTAMP_PATTERN = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g
```

Sort synced lines by `time` and drop empty metadata-only lines.

- [ ] **Step 4: Write safe lyrics discovery tests**

```ts
it('finds same-basename lrc next to a media file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lyrics-'))
  await writeFile(join(dir, 'Song.mp3'), '')
  await writeFile(join(dir, 'Song.lrc'), '[00:01.00]hello')

  await expect(readAdjacentLyrics(join(dir, 'Song.mp3'), [dir])).resolves.toEqual({
    path: join(dir, 'Song.lrc'),
    text: '[00:01.00]hello',
  })
})

it('rejects paths outside allowed roots', async () => {
  await expect(readAdjacentLyrics('C:\\\\Other\\\\Song.mp3', ['D:\\\\Library'])).resolves.toBeNull()
})
```

- [ ] **Step 5: Implement main-process safe read**

Use `dirname`, `basename`, `extname`, `readFile`, and existing `isPathWithinAnyLibrary` plus `media-folder` allowed roots.

- [ ] **Step 6: Add IPC channel and preload API**

```ts
MEDIA_GET_LYRICS: 'media:get-lyrics'
```

```ts
lyrics: {
  get: (filePath: string): Promise<{ path: string; text: string } | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MEDIA_GET_LYRICS, { filePath }),
}
```

- [ ] **Step 7: Add renderer lyrics hook**

```ts
export function useMediaLyrics(trackPath: string | null) {
  return useQuery({
    queryKey: ['media-lyrics', trackPath],
    queryFn: () => window.api.mediaLyrics.get(trackPath!),
    enabled: trackPath !== null,
  })
}
```

- [ ] **Step 8: Add toggle and display**

In media controls, add a `Captions` icon button:

```tsx
<Button variant="ghost" size="icon" aria-pressed={lyricsEnabled} onClick={() => setLyricsEnabled((v) => !v)}>
  <Captions className="h-4 w-4" />
</Button>
```

In fullscreen overlay and/or bar:

```tsx
{lyricsEnabled && parsedLyrics?.kind === 'synced' && (
  <div className="pointer-events-none absolute bottom-20 left-6 right-6 text-center text-lg font-medium text-white">
    {getActiveLyricLine(parsedLyrics, playback.currentTime)?.text}
  </div>
)}
```

- [ ] **Step 9: Run tests and typecheck**

Run: `npm test -- src/lib/lrc.test.ts electron/main/media/lyrics.test.ts`

Run: `npm run typecheck`

Expected: pass.

- [ ] **Step 10: Commit**

```bash
git add src/lib/lrc.ts src/lib/lrc.test.ts electron/main/media/lyrics.ts electron/main/media/lyrics.test.ts electron/main/ipc/mediaLyricsHandlers.ts electron/main/index.ts shared/types/ipc.ts electron/preload/index.ts src/services/mediaLyricsService.ts src/components/media/useMediaLyrics.ts src/components/media/MediaTransportBar.tsx src/components/media/FullscreenMediaOverlay.tsx src/components/media/MediaPlayerBar.tsx src/i18n/translations.ts
git commit -m "feat: show lrc lyrics during media playback"
```

---

### Task 8: Real Audio Cover Art Writes

**Files:**
- Create: `electron/main/media/audioCover.ts`
- Create: `electron/main/media/audioCover.test.ts`
- Modify: `electron/main/ipc/mediaThumbnailHandlers.ts`
- Modify: `shared/types/ipc.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/services/mediaThumbnailService.ts`
- Modify: `src/pages/Media/MediaPage.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Produces: `writeAudioCoverWithBackup(filePath, imagePath, deps): Promise<AudioCoverWriteResult>`.
- Consumes: selected image path from current trusted picker flow.
- Produces IPC result `{ mode: 'embedded' | 'override'; warning?: string }`.

- [ ] **Step 1: Write failing pipeline tests with injected dependencies**

```ts
it('backs up, writes, validates, replaces, and deletes backup on success', async () => {
  const calls: string[] = []
  const result = await writeAudioCoverWithBackup('D:\\Music\\Song.mp3', 'D:\\Cover.jpg', {
    copyFile: async () => calls.push('backup'),
    writeCover: async () => calls.push('write'),
    validateAudio: async () => {
      calls.push('validate')
      return { playable: true, hasAudioStream: true, durationSeconds: 120, hasCover: true }
    },
    replaceFile: async () => calls.push('replace'),
    removeFile: async () => calls.push('delete-backup'),
    restoreBackup: async () => calls.push('restore'),
    makeTempPath: () => 'D:\\Music\\Song.mp3.cover-work',
    makeBackupPath: () => 'D:\\Music\\Song.mp3.ark-cover-backup',
  })

  expect(result).toEqual({ ok: true, mode: 'embedded' })
  expect(calls).toEqual(['backup', 'write', 'validate', 'replace', 'validate', 'delete-backup'])
})

it('restores backup when validation fails', async () => {
  const calls: string[] = []
  const result = await writeAudioCoverWithBackup('D:\\Music\\Song.mp3', 'D:\\Cover.jpg', {
    ...deps,
    validateAudio: async () => ({ playable: false, hasAudioStream: false, durationSeconds: null, hasCover: false }),
    restoreBackup: async () => calls.push('restore'),
  })

  expect(result.ok).toBe(false)
  expect(calls).toContain('restore')
})
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test -- electron/main/media/audioCover.test.ts`

Expected: module missing.

- [ ] **Step 3: Implement supported format detection**

```ts
const EMBEDDABLE_AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.wav'])

export function getAudioCoverWriteSupport(filePath: string): 'supported' | 'unsupported' {
  return EMBEDDABLE_AUDIO_EXTENSIONS.has(extname(filePath).toLowerCase()) ? 'supported' : 'unsupported'
}
```

- [ ] **Step 4: Implement command adapter without shell strings**

Use `execFile(ffmpegPath, args)` with a generated work path. Return all command arguments from this pure helper, branching by extension inside the helper:

```ts
export function buildAudioCoverArgs(filePath: string, imagePath: string, outputPath: string): string[] {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.mp3') {
    return ['-y', '-i', filePath, '-i', imagePath, '-map', '0:a', '-map', '1:v', '-c', 'copy', '-id3v2_version', '3', outputPath]
  }
  if (ext === '.flac') {
    return ['-y', '-i', filePath, '-i', imagePath, '-map', '0:a', '-map', '1:v', '-c', 'copy', '-disposition:v:0', 'attached_pic', outputPath]
  }
  if (ext === '.m4a') {
    return ['-y', '-i', filePath, '-i', imagePath, '-map', '0:a', '-map', '1:v', '-c', 'copy', '-disposition:v:0', 'attached_pic', outputPath]
  }
  return ['-y', '-i', filePath, '-i', imagePath, '-map', '0:a', '-map', '1:v', '-c', 'copy', '-disposition:v:0', 'attached_pic', outputPath]
}
```

If WAV cover embedding is not accepted by ffmpeg for some files, return a structured failure and fall back to app-local override instead of corrupting the file.

- [ ] **Step 5: Implement validation adapter**

Call ffprobe/ffmpeg probing through injected command runner:

```ts
export interface AudioValidation {
  playable: boolean
  hasAudioStream: boolean
  durationSeconds: number | null
  hasCover: boolean
}
```

The success condition is `playable && hasAudioStream && duration close to original`. `hasCover` is required for mp3/flac/m4a and best-effort warning for wav.

- [ ] **Step 6: Wire IPC**

In `MEDIA_THUMBNAIL_SET_FROM_FILE`:

```ts
if (isAudioFile(filePath) && getAudioCoverWriteSupport(filePath) === 'supported') {
  const result = await writeAudioCoverWithBackup(filePath, sourcePath)
  if (result.ok) return result
}
const savedPath = await saveCustomCoverImage(mediaThumbnailOverrideCacheDir(), filePath, buffer)
setMediaThumbnailOverride(db, filePath, savedPath)
return { mode: 'override' }
```

- [ ] **Step 7: Update renderer service and row UI**

```ts
export function useSetMediaThumbnailFromFile() {
  return useMutation({
    mutationFn: ({ filePath, sourcePath }) =>
      window.api.mediaThumbnail.setFromFile(filePath, sourcePath),
  })
}
```

Show success/warning with `appToast` after Task 12. Until Task 12 lands, return the IPC result to the caller and do not add a new direct Sonner call in this task.

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test -- electron/main/media/audioCover.test.ts electron/main/media/resolveMediaThumbnail.test.ts electron/main/mediaThumbnailProtocol.test.ts`

Run: `npm run typecheck`

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add electron/main/media/audioCover.ts electron/main/media/audioCover.test.ts electron/main/ipc/mediaThumbnailHandlers.ts shared/types/ipc.ts electron/preload/index.ts src/services/mediaThumbnailService.ts src/pages/Media/MediaPage.tsx src/i18n/translations.ts
git commit -m "feat: embed selected covers into audio files"
```

---

### Task 9: Tray Minimize Lifecycle

**Files:**
- Modify: `electron/main/index.ts`
- Test: no unit test; verify with manual Electron run.

**Interfaces:**
- Produces: main window close hides to tray unless `isQuitting`.
- Produces: tray menu Open/Exit.

- [ ] **Step 1: Add tray imports and state**

```ts
import { app, BrowserWindow, dialog, Menu, Tray, type MenuItemConstructorOptions } from 'electron'

let tray: Tray | null = null
let isQuitting = false
```

- [ ] **Step 2: Add restore helper**

```ts
function showMainWindow(): void {
  if (!mainWindow) createWindow()
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}
```

- [ ] **Step 3: Create tray after window is created**

```ts
function createTray(): void {
  if (tray) return
  tray = new Tray(resolveLogoPath())
  tray.setToolTip('Ark Manager')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open', click: showMainWindow },
      {
        label: 'Exit',
        click: () => {
          isQuitting = true
          closePlayerWindow?.()
          app.quit()
        },
      },
    ])
  )
  tray.on('double-click', showMainWindow)
}
```

- [ ] **Step 4: Change main window close behavior**

```ts
win.on('close', (event) => {
  if (isQuitting) return
  event.preventDefault()
  win.hide()
})
```

Move existing `closed` cleanup so it only nulls `mainWindow` on actual destroy.

- [ ] **Step 5: Update `second-instance`**

Use `showMainWindow()` instead of only restore/focus.

- [ ] **Step 6: Update `window-all-closed`**

Do not quit on Windows while tray mode is active:

```ts
app.on('window-all-closed', () => {
  if (isQuitting || process.platform === 'darwin') return
})
```

If this causes macOS oddities, keep current darwin behavior and gate Windows only.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`

Verify:
- clicking X hides the main window,
- media keeps playing,
- tray double-click restores,
- tray Open restores,
- tray Exit quits,
- launching second instance restores hidden window.

- [ ] **Step 8: Commit**

```bash
git add electron/main/index.ts
git commit -m "feat: minimize main window to tray"
```

---

### Task 10: Explorer Path Utilities and Drag Feedback

**Files:**
- Create: `src/lib/pathParent.ts`
- Create: `src/lib/pathParent.test.ts`
- Modify: `src/lib/groupMovesByOriginalParent.ts`
- Modify: `src/lib/groupMovesByOriginalParent.test.ts`
- Modify: `src/pages/Explorer/breadcrumb.ts`
- Modify: `src/pages/Explorer/breadcrumb.test.ts`
- Modify: `src/pages/Explorer/ExplorerPage.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Produces: `getParentPath(path: string): string`.
- Produces: `pathToBreadcrumbSegments('\\\\server\\share\\folder')` includes UNC root `\\server\share\`.

- [ ] **Step 1: Write failing parent path tests**

```ts
it('returns drive root with trailing slash for a drive child', () => {
  expect(getParentPath('C:\\Games')).toBe('C:\\')
})

it('returns UNC share root for a UNC child', () => {
  expect(getParentPath('\\\\server\\share\\Games')).toBe('\\\\server\\share\\')
})

it('returns malformed UNC server root defensively when share is missing', () => {
  expect(getParentPath('\\\\server')).toBe('\\\\server\\')
})
```

- [ ] **Step 2: Write failing breadcrumb UNC tests**

```ts
it('builds UNC breadcrumb segments with server/share as the root', () => {
  expect(pathToBreadcrumbSegments('\\\\server\\share\\Games')).toEqual([
    { label: '\\\\server\\share', path: '\\\\server\\share\\' },
    { label: 'Games', path: '\\\\server\\share\\Games' },
  ])
})
```

- [ ] **Step 3: Run tests to verify fail**

Run: `npm test -- src/lib/pathParent.test.ts src/pages/Explorer/breadcrumb.test.ts src/lib/groupMovesByOriginalParent.test.ts`

Expected: new module missing and UNC breadcrumb fails.

- [ ] **Step 4: Implement `src/lib/pathParent.ts`**

```ts
export function getParentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normalized.startsWith('//')) {
    const parts = normalized.slice(2).split('/').filter(Boolean)
    if (parts.length === 0) return '\\\\'
    if (parts.length === 1) return `\\\\${parts[0]}\\`
    const root = `\\\\${parts[0]}\\${parts[1]}`
    if (parts.length === 2) return `${root}\\`
    return `${root}\\${parts.slice(2, -1).join('\\')}`.replace(/\\$/, '') || `${root}\\`
  }
  const parts = normalized.split('/').filter(Boolean)
  parts.pop()
  if (parts.length === 1 && /^[A-Za-z]:$/.test(parts[0])) return `${parts[0]}\\`
  return parts.join('\\')
}
```

- [ ] **Step 5: Re-export/use from group move module**

```ts
import { getParentPath } from './pathParent'
export { getParentPath }
```

- [ ] **Step 6: Fix breadcrumb UNC handling**

Handle `normalized.startsWith('//')` before generic split.

- [ ] **Step 7: Add drop rejection toast**

In `ExplorerPage.tsx`:

```ts
if (!findLibraryForPath(destDir, libraries ?? [])) {
  toast.error(t('explorer.dropOutsideLibrary'))
  return
}
```

Use `appToast.error(t('explorer.dropOutsideLibrary'))` after Task 12. If Task 10 is executed before Task 12, import `toast` from `sonner` here and replace it with `appToast` during Task 12.

- [ ] **Step 8: Run tests**

Run: `npm test -- src/lib/pathParent.test.ts src/pages/Explorer/breadcrumb.test.ts src/lib/groupMovesByOriginalParent.test.ts`

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/pathParent.ts src/lib/pathParent.test.ts src/lib/groupMovesByOriginalParent.ts src/lib/groupMovesByOriginalParent.test.ts src/pages/Explorer/breadcrumb.ts src/pages/Explorer/breadcrumb.test.ts src/pages/Explorer/ExplorerPage.tsx src/i18n/translations.ts
git commit -m "fix: harden Explorer path handling"
```

---

### Task 11: Explorer Visual, Grid, and Sidebar Polish

**Files:**
- Modify: `src/pages/Explorer/TabBar.tsx`
- Modify: `src/pages/Explorer/FolderView.tsx`
- Modify: `src/pages/Explorer/ExplorerSidebar.tsx`
- Modify: `src/pages/Explorer/ExplorerPage.tsx`
- Modify: `src/components/game/SelectionCheckbox.tsx`
- Test: `src/pages/Explorer/breadcrumb.test.ts`

**Interfaces:**
- Produces: stable toolbar height across selection modes.
- Produces: hidden zoom slider while Explorer search results are visible.
- Produces: no sidebar flash while persisted open state loads.

- [ ] **Step 1: Stabilize selection toolbar height**

In `SelectionToolbar`, keep inactive and active wrappers same height:

```tsx
return (
  <div className="ml-auto flex h-9 shrink-0 items-center">
    {!isActive ? <Button ... /> : <div className="flex h-9 items-center gap-1 ...">...</div>}
  </div>
)
```

Update every `SelectionToolbar` caller so the toolbar row keeps the same height:
`GalleryPage.tsx`, `ListPage.tsx`, `DetailListPage.tsx`, and `FolderView.tsx`.

- [ ] **Step 2: Hide zoom during search**

In `FolderView.tsx`:

```tsx
zoom={viewMode === 'grid' && !isSearching ? zoom : undefined}
onZoomChange={viewMode === 'grid' && !isSearching ? setZoom : undefined}
```

- [ ] **Step 3: Fix search/normal crossfade keys**

Wrap the whole content region in one `AnimatePresence`:

```tsx
<AnimatePresence mode="wait">
  <motion.div key={isSearching ? `search:${path}` : `normal:${path}:${viewMode}`} ...>
    ...
  </motion.div>
</AnimatePresence>
```

- [ ] **Step 4: Align icons**

Give row icon region stable dimensions:

```tsx
<div className="flex h-8 w-8 shrink-0 items-center justify-center">
  <EntryIcon entry={entry} />
</div>
```

Ensure `EntryIcon` itself does not add inconsistent shrink/width behavior.

- [ ] **Step 5: Animate TabBar action buttons**

Wrap plus/open-folder buttons in `motion.div layout` within the same flex row:

```tsx
<motion.div layout transition={{ duration: 0.15 }}>
  <button ...><Plus /></button>
</motion.div>
```

Remove `exit={{ width: 0 }}` from non-tab action button wrappers. Keep width
exit animation only on the actual tab `motion.div` wrapper that represents a
closing tab.

- [ ] **Step 6: Avoid sidebar flash**

In `ExplorerPage.tsx`:

```ts
const { data: sidebarOpenSetting, isLoading: sidebarOpenLoading } = useExplorerTreeOpenQuery()
if (sidebarOpenLoading) return <div className="flex h-full min-w-0 flex-1 flex-col"><TabBar />...</div>
const sidebarOpen = sidebarOpenSetting ?? true
```

Render the main Explorer content without the sidebar until the setting resolves; do not hide the tab bar or active folder view during the loading frame.

- [ ] **Step 7: Avoid redundant Set recreation**

In `ExplorerSidebar.tsx`:

```ts
setExpandedPaths((prev) => {
  let changed = false
  const next = new Set(prev)
  for (const ancestorPath of ancestorPaths) {
    const normalized = normalizePath(ancestorPath)
    if (!next.has(normalized)) {
      next.add(normalized)
      changed = true
    }
  }
  return changed ? next : prev
})
```

- [ ] **Step 8: Add limited keyboard move affordance**

Implement focused-row action, not full dnd-kit keyboard parity:

```tsx
onKeyDown={(event) => {
  if (event.ctrlKey && event.shiftKey && event.key === 'ArrowUp') {
    event.preventDefault()
    onMove(entry)
  }
}}
tabIndex={0}
```

Use existing Move dialog so destination selection remains safe and familiar.

- [ ] **Step 9: Run typecheck**

Run: `npm run typecheck`

Expected: no TypeScript errors.

- [ ] **Step 10: Manual verify Explorer**

Run: `npm run dev`

Verify:
- adding/removing tabs slides buttons smoothly,
- search/normal switch crossfades,
- grid does not jump entering selection mode,
- zoom hidden during search,
- sidebar no longer flashes open before persisted setting loads.

- [ ] **Step 11: Commit**

```bash
git add src/pages/Explorer/TabBar.tsx src/pages/Explorer/FolderView.tsx src/pages/Explorer/ExplorerSidebar.tsx src/pages/Explorer/ExplorerPage.tsx src/components/layout/SelectionToolbar.tsx src/components/game/SelectionCheckbox.tsx
git commit -m "fix: polish Explorer interactions"
```

---

### Task 12: UI Consistency and Toast Wrapper

**Files:**
- Create: `src/lib/appToast.ts`
- Modify: `src/components/layout/AppLayout.tsx`
- Modify: `src/services/fileOpsService.ts`
- Modify: `src/components/layout/PageToolbar.tsx`
- Modify: `src/pages/Media/MediaPage.tsx`
- Modify: `src/components/media/MediaPlayerBar.tsx`
- Modify: `src/components/media/MediaPlaylistPanel.tsx`
- Modify: `src/components/game/DetailSidebar.tsx`
- Modify: `src/components/game/DetailOverlay.tsx`
- Modify: `src/components/game/RenameDialog.tsx`
- Modify: `src/components/game/MoveDialog.tsx`

**Interfaces:**
- Produces: `appToast.success(message, options?)`, `appToast.error(message, options?)`, `appToast.info(message, options?)`.
- Keeps Sonner as the implementation.

- [ ] **Step 1: Add toast helper**

```ts
import { toast } from 'sonner'

export const appToast = {
  success: (message: string, options?: Parameters<typeof toast.success>[1]) =>
    toast.success(message, { duration: 3500, ...options }),
  error: (message: string, options?: Parameters<typeof toast.error>[1]) =>
    toast.error(message, { duration: 5000, ...options }),
  info: (message: string, options?: Parameters<typeof toast>[1]) =>
    toast(message, { duration: 3500, ...options }),
}
```

- [ ] **Step 2: Use helper at existing toast call sites**

Replace direct `toast.success`/`toast.error` in `fileOpsService.ts`:

```ts
appToast.success(t('fileOps.movedToast', { count: moved.length }), {
  action: { label: t('fileOps.undo'), onClick: () => performUndo(mutation) },
})
```

- [ ] **Step 3: Standardize toolbar icon button classes**

Use `Button size="icon" variant="ghost"` for toolbar buttons in these files:
`PageToolbar.tsx`, `MediaPlayerBar.tsx`, `MediaTransportBar.tsx`,
`DetailSidebar.tsx`, `DetailOverlay.tsx`, and `TabBar.tsx`.

```tsx
<Button variant="ghost" size="icon" aria-label={...}>
  <Icon className="h-4 w-4" />
</Button>
```

- [ ] **Step 4: Standardize row thumbnail/icon columns**

Where rows use thumbnail/icon, use:

```tsx
<div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
  ...
</div>
```

- [ ] **Step 5: Standardize dialog action spacing**

In touched dialogs, use:

```tsx
<div className="flex justify-end gap-2">
  <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
  <Button onClick={handleApply}>{t('common.save')}</Button>
</div>
```

Do not rewrite unrelated dialog content.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`

Expected: pass.

- [ ] **Step 7: Manual visual pass**

Run: `npm run dev`

Check light and dark themes for:
- toast placement,
- toolbar button sizing,
- dialog action alignment,
- media row icon alignment.

- [ ] **Step 8: Commit**

```bash
git add src/lib/appToast.ts src/components/layout/AppLayout.tsx src/services/fileOpsService.ts src/components/layout/PageToolbar.tsx src/pages/Media/MediaPage.tsx src/components/media/MediaPlayerBar.tsx src/components/media/MediaPlaylistPanel.tsx src/components/game/DetailSidebar.tsx src/components/game/DetailOverlay.tsx src/components/game/RenameDialog.tsx src/components/game/MoveDialog.tsx
git commit -m "style: unify app controls and toast usage"
```

---

### Task 13: Final Verification

**Files:**
- No direct file edits for a clean verification run. Defects are handled by
  returning to the owning task and editing that task's files.

**Interfaces:**
- Consumes all previous tasks.
- Produces clean test/typecheck/lint result or documented residual failures.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all pass.

- [ ] **Step 2: Run application manually**

Run: `npm run dev`

Verify:
- `r45775` and `v45775` do not collide,
- metadata refresh tries fallback chain only on button click,
- favorite duplicate code shows one card,
- combined search/tag input expands together,
- file-list refresh does not stop audio/video,
- `.lrc` lyrics display and toggle,
- audio cover writes succeed on sample mp3/flac/m4a/wav or fail with restore,
- closing main window hides to tray and does not stop playback,
- tray Exit quits,
- Explorer fixes behave as specified.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: Electron build succeeds.

- [ ] **Step 4: Handle verification defects through the owning task**

If verification reveals a defect, return to the task that owns that behavior,
add the missing failing test there, make the fix, rerun that task's targeted
tests, then rerun this final verification task from Step 1.
