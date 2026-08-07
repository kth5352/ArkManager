# Explicit VNDB Code Prefix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ambiguous VNDB filename codes with explicit `VNV`/`VNR` identities while preserving existing VNDB metadata, user data, code links, and save snapshots.

**Architecture:** A shared canonical-code parser owns all prefix-to-type mapping so three-character VNDB prefixes are never inferred with `slice(0, 2)`. Filename scanning accepts only canonical prefixes, while the search input alone accepts bare VNDB `v`/`r` IDs. Startup migrations copy legacy database identities and save directories to canonical keys without overwriting an existing canonical target.

**Tech Stack:** TypeScript, Electron, React, Zod, better-sqlite3/Drizzle, Vitest, Node.js filesystem APIs

## Global Constraints

- `VNV<digits>` represents a VNDB visual novel and maps externally to `v<digits>`.
- `VNR<digits>` represents a VNDB release and maps externally to `r<digits>`.
- Filename scanning must not recognize bare `v<digits>`, bare `r<digits>`, legacy `VN<digits>`, or legacy `VR<digits>`.
- The game-search input must continue accepting an entire bare `v<digits>` or `r<digits>` input.
- Existing `RJ`, `VJ`, `ST`, and `GC` behavior must remain unchanged.
- Migrations must be idempotent and must never overwrite an existing canonical row or save directory.
- Do not rename existing cached cover files; migrated metadata keeps its absolute `cover_image_path`.

---

## File Structure

- Create `shared/gameCode.ts`: parse an exact canonical code value and expose prefix-safe numeric extraction.
- Create `shared/gameCode.test.ts`: canonical parser coverage for all supported code families.
- Modify `shared/types/scanner.ts` and `shared/types/ipc.ts`: replace `VN`/`VR` with `VNV`/`VNR` in shared contracts.
- Modify `electron/main/scanner/codeRecognition.ts`: find canonical prefixes inside filenames only.
- Modify `src/pages/DlsiteSearch/parseCodeInput.ts`: accept canonical values plus whole-input bare VNDB IDs.
- Modify `electron/main/scanner/folderScanner.ts`: parse persisted overrides with the shared canonical parser.
- Modify VNDB metadata, shell, IPC, filter, and search tests/consumers to use the new identities.
- Create `electron/main/database/migrateVndbCodePrefixes.ts`: migrate legacy database keys transactionally.
- Create `electron/main/database/migrateVndbCodePrefixes.test.ts`: verify preservation, conflicts, and idempotency.
- Create `electron/main/save/migrateVndbSaveDirectories.ts`: copy legacy save roots to canonical names without overwriting.
- Create `electron/main/save/migrateVndbSaveDirectories.test.ts`: verify copy, conflict, and idempotency behavior.
- Modify `electron/main/database/client.ts` and `electron/main/index.ts`: invoke migrations during startup.

---

### Task 1: Canonical Code Parsing and Scanner Regression

**Files:**
- Create: `shared/gameCode.ts`
- Create: `shared/gameCode.test.ts`
- Modify: `shared/types/scanner.ts`
- Modify: `shared/types/ipc.ts`
- Modify: `shared/types/ipc.test.ts`
- Modify: `electron/main/scanner/codeRecognition.ts`
- Modify: `electron/main/scanner/codeRecognition.test.ts`
- Modify: `electron/main/scanner/folderScanner.ts`
- Modify: `electron/main/scanner/folderScanner.test.ts`
- Modify: `src/pages/DlsiteSearch/parseCodeInput.ts`
- Modify: `src/pages/DlsiteSearch/parseCodeInput.test.ts`

**Interfaces:**
- Produces: `parseCanonicalGameCode(value: string): GameCode | null`
- Produces: `numericGameCodeId(code: GameCode): string`
- Produces: `GameCodeType = 'RJ' | 'VJ' | 'ST' | 'VNV' | 'VNR' | 'GC'`
- Consumes: no interfaces from later tasks

- [ ] **Step 1: Write failing shared parser and schema tests**

```ts
expect(parseCanonicalGameCode('VNV45775')).toEqual({ type: 'VNV', value: 'VNV45775' })
expect(parseCanonicalGameCode('vnr45775')).toEqual({ type: 'VNR', value: 'VNR45775' })
expect(parseCanonicalGameCode('VN45775')).toBeNull()
expect(parseCanonicalGameCode('VR45775')).toBeNull()
expect(parseCanonicalGameCode('v45775')).toBeNull()
expect(numericGameCodeId({ type: 'VNV', value: 'VNV45775' })).toBe('45775')
expect(GameCodeSchema.parse({ type: 'VNR', value: 'VNR45775' })).toEqual({
  type: 'VNR',
  value: 'VNR45775',
})
```

- [ ] **Step 2: Run the new shared tests and confirm the old contracts fail**

Run: `npx vitest run shared/gameCode.test.ts shared/types/ipc.test.ts`

Expected: FAIL because `shared/gameCode.ts` does not exist and `GameCodeSchema` does not accept `VNV`/`VNR`.

- [ ] **Step 3: Implement the canonical parser and shared type contracts**

```ts
const CANONICAL_CODE_PATTERN = /^(RJ|VJ|ST|VNV|VNR|GC)(\d+)$/i

export function parseCanonicalGameCode(value: string): GameCode | null {
  const match = CANONICAL_CODE_PATTERN.exec(value)
  if (!match) return null
  const type = match[1].toUpperCase() as GameCodeType
  return { type, value: `${type}${match[2]}` }
}

export function numericGameCodeId(code: GameCode): string {
  return code.value.slice(code.type.length)
}
```

Update the shared union and Zod enum to contain `VNV` and `VNR`, with no `VN` or `VR` members.

- [ ] **Step 4: Write failing filename, search-input, override, and recursive-scan tests**

```ts
expect(extractCode('[VNV45775] Game')).toEqual({ type: 'VNV', value: 'VNV45775' })
expect(extractCode('VNR45775_release.zip')).toEqual({ type: 'VNR', value: 'VNR45775' })
expect(extractCode('Game_v912.exe')).toBeNull()
expect(extractCode('Title v1.0.4')).toBeNull()
expect(extractCode('v8_context_snapshot.bin')).toBeNull()
expect(extractCode('model_v2.index')).toBeNull()
expect(extractCode('[v45775] Game')).toBeNull()
expect(parseCodeInput('v45775')).toEqual({ type: 'VNV', value: 'VNV45775' })
expect(parseCodeInput('r45775')).toEqual({ type: 'VNR', value: 'VNR45775' })
expect(parseCodeInput('VNV45775')).toEqual({ type: 'VNV', value: 'VNV45775' })
```

Add this recursive scanner regression:

```ts
await mkdir(join(dir, 'Arms Breath', 'bgm'), { recursive: true })
await writeFile(join(dir, 'Arms Breath', 'Game_v912.exe'), '')
await writeFile(join(dir, 'Arms Breath', 'System.ini'), '')
await writeFile(join(dir, 'Arms Breath', 'bgm', 'track.ogg'), '')

const entries = await scanLibraryRecursive(dir)
expect(entries.map((entry) => entry.name)).toEqual(['Arms Breath'])
```

Extend the override test to pass `new Map([[normalizedPath, 'VNV17']])` and assert `type: 'VNV'`, proving that no two-character slicing remains.

- [ ] **Step 5: Run scanner/input tests and confirm the ambiguous-code failures**

Run: `npx vitest run electron/main/scanner/codeRecognition.test.ts electron/main/scanner/folderScanner.test.ts src/pages/DlsiteSearch/parseCodeInput.test.ts`

Expected: FAIL because bare `v`/`r` filename recognition and two-character override parsing still exist.

- [ ] **Step 6: Implement strict filename recognition and search-only shorthand**

Use a filename pattern containing canonical prefixes only:

```ts
const CODE_PATTERN = /(?<![A-Za-z0-9])((?:RJ|VJ|ST|VNV|VNR|GC)\d+)(?![0-9])/i
```

Pass the matched value and every persisted override through `parseCanonicalGameCode`. In `parseCodeInput`, check the exact bare shorthand first and map `v` to `VNV` and `r` to `VNR`; otherwise call `parseCanonicalGameCode(trimmed)`.

- [ ] **Step 7: Run Task 1 tests**

Run: `npx vitest run shared/gameCode.test.ts shared/types/ipc.test.ts electron/main/scanner/codeRecognition.test.ts electron/main/scanner/folderScanner.test.ts src/pages/DlsiteSearch/parseCodeInput.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add shared/gameCode.ts shared/gameCode.test.ts shared/types/scanner.ts shared/types/ipc.ts shared/types/ipc.test.ts electron/main/scanner/codeRecognition.ts electron/main/scanner/codeRecognition.test.ts electron/main/scanner/folderScanner.ts electron/main/scanner/folderScanner.test.ts src/pages/DlsiteSearch/parseCodeInput.ts src/pages/DlsiteSearch/parseCodeInput.test.ts
git commit -m "fix: require explicit VNDB filename prefixes"
```

---

### Task 2: VNDB API, URL, Metadata, and Filter Consumers

**Files:**
- Modify: `electron/main/metadata/vndbClient.ts`
- Modify: `electron/main/metadata/vndbClient.test.ts`
- Modify: `electron/main/metadata/crawlGameMetadata.ts`
- Modify: `electron/main/metadata/crawlGameMetadata.test.ts`
- Modify: `electron/main/ipc/metadataHandlers.ts`
- Modify: `electron/main/shell/buildExternalUrl.ts`
- Modify: `electron/main/shell/buildExternalUrl.test.ts`
- Modify: `src/lib/filterEntries.test.ts`
- Modify: `src/pages/GameSearch/GameSearchPage.tsx` only if a legacy type/value assumption is found during the required reference scan

**Interfaces:**
- Consumes: `numericGameCodeId(code: GameCode): string` from Task 1
- Produces: VNDB consumers that accept only `VNV`/`VNR`

- [ ] **Step 1: Change VNDB-facing tests to the new identities**

```ts
expect(toVndbId({ type: 'VNV', value: 'VNV17' })).toBe('v17')
expect(toVndbId({ type: 'VNR', value: 'VNR45775' })).toBe('r45775')
expect(buildExternalUrl({ type: 'VNV', value: 'VNV17' })).toBe('https://vndb.org/v17')
expect(buildExternalUrl({ type: 'VNR', value: 'VNR45775' })).toBe(
  'https://vndb.org/r45775'
)
expect(mapVnToSearchResult(vn).code).toEqual({ type: 'VNV', value: 'VNV17' })
```

Update crawl-source tests to use `VNV`/`VNR`, and update the filter regression to search for `VNR45775`.

- [ ] **Step 2: Run VNDB consumer tests and confirm legacy branches fail**

Run: `npx vitest run electron/main/metadata/vndbClient.test.ts electron/main/metadata/crawlGameMetadata.test.ts electron/main/shell/buildExternalUrl.test.ts src/lib/filterEntries.test.ts`

Expected: FAIL because production branches still check `VN`/`VR` and strip two characters.

- [ ] **Step 3: Update every VNDB consumer**

Apply these exact rules:

```ts
if (code.type === 'VNR') return `r${numericGameCodeId(code)}`
return `v${numericGameCodeId(code)}`
```

```ts
if (code.type === 'VNV' || code.type === 'VNR') {
  return crawlSingleSource('vndb', () => crawlVndb(code))
}
```

```ts
return code.type === 'VNR' ? crawlVndbRelease(code) : crawlVndbVn(code)
```

Map VNDB title-search results to:

```ts
{ type: 'VNV', value: `VNV${vn.id.slice(1)}` }
```

Use `numericGameCodeId` in external URLs instead of fixed-length slicing. Update comments and user-visible code values, but keep the source label `VNDB` unchanged.

- [ ] **Step 4: Prove no production legacy type checks remain**

Run: `rg -n "type === 'VN'|type === 'VR'|type: 'VN'|type: 'VR'|value: \\`VN|value: \\`VR" electron src shared -g '*.ts' -g '*.tsx'`

Expected: no production matches. Legacy strings are allowed only in Task 3 migration tests and migration code.

- [ ] **Step 5: Run Task 2 tests and typecheck**

Run: `npx vitest run electron/main/metadata/vndbClient.test.ts electron/main/metadata/crawlGameMetadata.test.ts electron/main/shell/buildExternalUrl.test.ts src/lib/filterEntries.test.ts`

Run: `npm run typecheck`

Expected: both commands PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add electron/main/metadata/vndbClient.ts electron/main/metadata/vndbClient.test.ts electron/main/metadata/crawlGameMetadata.ts electron/main/metadata/crawlGameMetadata.test.ts electron/main/ipc/metadataHandlers.ts electron/main/shell/buildExternalUrl.ts electron/main/shell/buildExternalUrl.test.ts src/lib/filterEntries.test.ts src/pages/GameSearch/GameSearchPage.tsx
git commit -m "refactor: adopt VNV and VNR identities"
```

---

### Task 3: Preserve Legacy Database Identities

**Files:**
- Create: `electron/main/database/migrateVndbCodePrefixes.ts`
- Create: `electron/main/database/migrateVndbCodePrefixes.test.ts`
- Modify: `electron/main/database/client.ts`
- Modify: `electron/main/database/client.test.ts`

**Interfaces:**
- Produces: `legacyVndbCodeToCanonical(value: string): string | null`
- Produces: `migrateVndbCodePrefixes(sqlite: Database.Database): void`
- Consumes: raw `better-sqlite3` client before Drizzle is returned

- [ ] **Step 1: Write failing canonicalization and migration tests**

```ts
expect(legacyVndbCodeToCanonical('VN17')).toBe('VNV17')
expect(legacyVndbCodeToCanonical('VR45775')).toBe('VNR45775')
expect(legacyVndbCodeToCanonical('VNV17')).toBeNull()
expect(legacyVndbCodeToCanonical('VN1junk')).toBeNull()
```

Seed a temporary old database with:

- `game_metadata.code = VN17`, including a `cover_image_path` ending in `VN17.webp`;
- `metadata_failures.code = VR20`;
- `game_user_data.key = VN17`, with favorite, rating, memo, playtime, launch config, save path, and custom cover fields populated;
- `path_code_overrides.code = VN17`;
- `save_snapshot_labels.key = VR20`.

After `createDbClient`, assert canonical rows exist with identical non-key values, the override now contains `VNV17`, the old cover path is unchanged, and a second `createDbClient` run produces the same rows.

- [ ] **Step 2: Add a canonical-target conflict test**

Seed both `VN17` and `VNV17` with different metadata. Assert that migration leaves `VNV17` unchanged and retains `VN17` rather than overwriting or deleting either row.

- [ ] **Step 3: Run migration tests and confirm no migration exists**

Run: `npx vitest run electron/main/database/migrateVndbCodePrefixes.test.ts electron/main/database/client.test.ts`

Expected: FAIL because migration exports and startup invocation do not exist.

- [ ] **Step 4: Implement exact legacy conversion and transactional row migration**

```ts
export function legacyVndbCodeToCanonical(value: string): string | null {
  const vn = /^VN(\d+)$/.exec(value)
  if (vn) return `VNV${vn[1]}`
  const vr = /^VR(\d+)$/.exec(value)
  return vr ? `VNR${vr[1]}` : null
}
```

Implement a hardcoded table descriptor list for `game_metadata.code`, `metadata_failures.code`, `game_user_data.key`, and `save_snapshot_labels.key`. For each selected legacy row, use `INSERT OR IGNORE` with all columns and the canonical key. Delete the legacy row only when that insert reports `changes === 1`; for `save_snapshot_labels`, include `timestamp` in the delete predicate. Update `path_code_overrides.code` in place. Wrap all database work in one `sqlite.transaction(...)()` call.

Call `migrateVndbCodePrefixes(sqlite)` in `createDbClient` after every table has been created and before `drizzle(sqlite, { schema })` is returned.

- [ ] **Step 5: Run database migration tests**

Run: `npx vitest run electron/main/database/migrateVndbCodePrefixes.test.ts electron/main/database/client.test.ts`

Expected: PASS, including second-run and canonical-conflict cases.

- [ ] **Step 6: Commit Task 3**

```bash
git add electron/main/database/migrateVndbCodePrefixes.ts electron/main/database/migrateVndbCodePrefixes.test.ts electron/main/database/client.ts electron/main/database/client.test.ts
git commit -m "feat: migrate legacy VNDB database keys"
```

---

### Task 4: Preserve Legacy Save Snapshot Directories

**Files:**
- Create: `electron/main/save/migrateVndbSaveDirectories.ts`
- Create: `electron/main/save/migrateVndbSaveDirectories.test.ts`
- Modify: `electron/main/index.ts`

**Interfaces:**
- Consumes: `legacyVndbCodeToCanonical(value: string): string | null` from Task 3
- Produces: `migrateVndbSaveDirectories(savesRoot: string): Promise<void>`

- [ ] **Step 1: Write failing filesystem migration tests**

```ts
await mkdir(join(root, 'VN17', '2026-01-01T00-00-00-000Z'), { recursive: true })
await writeFile(join(root, 'VN17', '2026-01-01T00-00-00-000Z', 'save.dat'), 'legacy')

await migrateVndbSaveDirectories(root)

expect(await readFile(join(root, 'VNV17', '2026-01-01T00-00-00-000Z', 'save.dat'), 'utf8'))
  .toBe('legacy')
```

Also test:

- `VR20` copies to `VNR20`;
- an existing `VNV17` target remains byte-for-byte unchanged;
- `VN1junk`, `VNV17`, and unrelated directories are ignored;
- running migration twice succeeds and produces no additional directories.

- [ ] **Step 2: Run the filesystem migration test and confirm it fails**

Run: `npx vitest run electron/main/save/migrateVndbSaveDirectories.test.ts`

Expected: FAIL because the migration module does not exist.

- [ ] **Step 3: Implement non-destructive save-directory copying**

Read direct children of `savesRoot` with `readdir({ withFileTypes: true })`. Return normally on `ENOENT`. For each directory whose name converts through `legacyVndbCodeToCanonical`, check the canonical target with `lstat`; when no target exists, copy recursively with `cp(source, target, { recursive: true, errorOnExist: true })`. Never remove or rename the legacy source.

- [ ] **Step 4: Invoke the save migration before opening the database**

In `app.whenReady()`, after `migrateUserDataFolder` and before `createDbClient`, add:

```ts
await migrateVndbSaveDirectories(join(newUserDataPath, 'saves'))
```

Copying first and retaining the source ensures a later database-open failure cannot make the old snapshots unrecoverable.

- [ ] **Step 5: Run Task 4 tests**

Run: `npx vitest run electron/main/save/migrateVndbSaveDirectories.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add electron/main/save/migrateVndbSaveDirectories.ts electron/main/save/migrateVndbSaveDirectories.test.ts electron/main/index.ts
git commit -m "feat: preserve legacy VNDB save snapshots"
```

---

### Task 5: Full Regression Verification

**Files:**
- Modify only files required to fix failures directly caused by Tasks 1-4

**Interfaces:**
- Consumes: all prior task deliverables
- Produces: verified `VNV`/`VNR` release candidate behavior

- [ ] **Step 1: Run the complete targeted regression set**

Run:

```bash
npx vitest run shared/gameCode.test.ts shared/types/ipc.test.ts electron/main/scanner/codeRecognition.test.ts electron/main/scanner/folderScanner.test.ts src/pages/DlsiteSearch/parseCodeInput.test.ts electron/main/metadata/vndbClient.test.ts electron/main/metadata/crawlGameMetadata.test.ts electron/main/shell/buildExternalUrl.test.ts src/lib/filterEntries.test.ts electron/main/database/migrateVndbCodePrefixes.test.ts electron/main/database/client.test.ts electron/main/save/migrateVndbSaveDirectories.test.ts
```

Expected: PASS.

- [ ] **Step 2: Scan for forbidden legacy production assumptions**

Run:

```bash
rg -n "type === 'VN'|type === 'VR'|type: 'VN'|type: 'VR'|slice\(0, 2\).*GameCodeType|\[vr\]\\d" electron src shared -g '*.ts' -g '*.tsx'
```

Expected: only migration code/tests may contain `VN`/`VR`; no filename recognizer contains bare `[vr]\d` matching.

- [ ] **Step 3: Run project-wide verification**

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm test`

Expected: typecheck and tests pass; lint has no new warnings or errors.

- [ ] **Step 4: Reproduce the reported real-library scan read-only**

Run:

```powershell
.\node_modules\.bin\tsx.cmd -e "import { scanLibraryRecursive } from './electron/main/scanner/folderScanner.ts'; void (async()=>{ const entries=await scanLibraryRecursive('D:\\ark\\ehddls'); console.log(JSON.stringify(entries.filter((entry)=>entry.path.includes('アームズブレス')),null,2)); })();"
```

Expected: one `アームズブレス` folder entry; no `bgm`, `bmp`, `data`, `user_data`, `wave`, or `Game_v912.exe` entries.

- [ ] **Step 5: Build the packaged application**

Run: `npm run build`

Expected: renderer/main/preload compilation and the Windows installer build complete for version `1.1.0`.

- [ ] **Step 6: Commit any verification-only fixes**

If Step 3 exposed directly related compile/lint/test gaps, stage only those fixes and commit:

```bash
git add -u -- electron src shared
git commit -m "fix: complete VNV and VNR migration"
```

If no fixes were needed, do not create an empty commit.
