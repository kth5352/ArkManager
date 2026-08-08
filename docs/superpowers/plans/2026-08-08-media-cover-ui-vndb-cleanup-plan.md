# Media Cover, UI Warning, Zoom, and Legacy VNDB Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep WAV files unchanged while showing selected covers in Ark Manager, clean redundant recovery backups, eliminate duplicate dialog keys, support common `Ctrl++` inputs, and remove unreferenced metadata left by ambiguous legacy VNDB filename recognition.

**Architecture:** Media write support remains centralized in `audioCover.ts`; WAV takes the existing override-only IPC path while MP3/FLAC/M4A gain hash-verified recovery cleanup. Two small pure helpers own dialog-key and zoom-input rules. The existing transactional VNDB migration gathers user-owned references before deciding whether legacy metadata is migrated or deleted.

**Tech Stack:** Electron 43, TypeScript 6, React 19, better-sqlite3, Vitest 4, Node.js crypto/fs streams, FFmpeg for MP3/FLAC/M4A only.

## Global Constraints

- WAV audio bytes must remain unchanged; WAV cover selection must not invoke FFmpeg or create audio work/backup files.
- Ark Manager must display a selected WAV cover through the existing app-local media-thumbnail override.
- Do not claim or attempt stock Windows Explorer WAV cover support.
- MP3/FLAC/M4A keep backup, candidate validation, replacement, and final validation.
- Delete only the backup created by the current operation, and only after successful restoration plus exact SHA-256 equality.
- Never recursively scan user libraries to delete historical backup files.
- User-owned legacy VNDB state is preserved; only unreferenced `game_metadata` and `metadata_failures` legacy cache rows are deleted.
- VNDB cache cleanup and identity migration remain one SQLite transaction.
- `Game_v912.exe` and version-like filenames must remain unrecognized.
- Tests use temporary files and temporary/in-memory databases only. Never open the actual user DB in writable mode.
- Keep package version `1.1.0`.

---

### Task 1: WAV Override-Only Covers and Verified Backup Cleanup

**Files:**
- Modify: `electron/main/media/audioCover.ts`
- Modify: `electron/main/media/audioCover.test.ts`
- Modify: `electron/main/ipc/mediaThumbnailHandlers.test.ts`

**Interfaces:**
- Produces: `getAudioCoverWriteSupport(filePath: string): 'supported' | 'unsupported'`, with WAV returning `unsupported`
- Produces: `sha256File(filePath: string): Promise<string>` as the default streaming hash dependency
- Extends: `AudioCoverDependencies` with `hashFile(filePath: string): Promise<string>` and `reportError(error: unknown): void`
- Preserves: `writeAudioCoverWithBackup(filePath, imagePath, deps?): Promise<AudioCoverWriteResult>`
- Consumes: the existing media-thumbnail override path in `registerMediaThumbnailHandlers`

- [ ] **Step 1: Change WAV support and argument tests first**

Update `getAudioCoverWriteSupport` expectations so only MP3, FLAC, and M4A are supported:

```ts
it.each(['mp3', 'flac', 'm4a', 'MP3'])('supports cover embedding for .%s files', (extension) => {
  expect(getAudioCoverWriteSupport(`D:\\Music\\Song.${extension}`)).toBe('supported')
})

it('routes WAV through an app-local override', () => {
  expect(getAudioCoverWriteSupport('D:\\Music\\Song.wav')).toBe('unsupported')
})
```

Remove WAV from the attached-picture argument table and add a guard test:

```ts
expect(() =>
  buildAudioCoverArgs('D:\\Music\\Song.wav', 'D:\\Cover.jpg', 'D:\\Music\\work.wav')
).toThrow(/unsupported/i)
```

- [ ] **Step 2: Write failing recovery-cleanup tests**

Add `hashFile` and `reportError` to `createDeps`; default hashes are identical and the test reporter records `report-error` without writing to the real console. Change existing failure expectations and add explicit mismatch coverage:

```ts
it('deletes the backup after a failed write is restored and hash-verified', async () => {
  const calls: string[] = []
  const result = await writeAudioCoverWithBackup(
    'D:\\Music\\Song.flac',
    'D:\\Cover.jpg',
    createDeps(calls, {
      writeCover: async () => {
        calls.push('write')
        throw new Error('full ffmpeg command and stderr')
      },
      hashFile: async () => 'same-sha256',
    })
  )

  expect(result).toMatchObject({ ok: false, mode: 'override' })
  expect(result.warning).not.toContain('ffmpeg command')
  expect(calls).toEqual([
    'backup',
    'write',
    'report-error',
    'restore',
    'hash',
    'hash',
    'delete-backup',
    'delete-work',
  ])
})

it('retains the backup when restored source and backup hashes differ', async () => {
  const calls: string[] = []
  let hashCall = 0
  const result = await writeAudioCoverWithBackup(
    'D:\\Music\\Song.m4a',
    'D:\\Cover.jpg',
    createDeps(calls, {
      writeCover: async () => {
        calls.push('write')
        throw new Error('ffmpeg failed')
      },
      hashFile: async () => (++hashCall === 1 ? 'source-hash' : 'backup-hash'),
    })
  )

  expect(result.warning).toMatch(/backup.*retained/i)
  expect(calls).not.toContain('delete-backup')
})
```

Keep the restore-failure test expecting `AudioCoverRestoreError`; hash verification must not run after restoration itself fails.

- [ ] **Step 3: Write the failing WAV IPC integration test**

Change the `audioCover` mock to preserve the real support function while replacing only the destructive writer:

```ts
const audioCoverMocks = vi.hoisted(() => ({
  writeAudioCoverWithBackup: vi.fn(),
}))

vi.mock('../media/audioCover', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media/audioCover')>()),
  writeAudioCoverWithBackup: audioCoverMocks.writeAudioCoverWithBackup,
}))
```

Then extend `mediaThumbnailHandlers.test.ts` with a real temporary image file and repository assertion. The real current support function returns `supported` for WAV, so this test fails before production changes.

```ts
it('stores a WAV cover as an app-local override without attempting embedding', async () => {
  const sourcePath = join(dir, 'cover.jpg')
  await writeFile(sourcePath, Buffer.from('image'))
  electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
  customCoverMocks.saveCustomCoverImage.mockResolvedValue('C:\\ArkManagerTest\\cache\\cover.webp')
  audioCoverMocks.writeAudioCoverWithBackup.mockResolvedValue({ ok: true, mode: 'embedded' })

  await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE)({})
  const result = await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE)({}, {
    filePath: 'D:\\Music\\Song.wav',
    sourcePath,
  })

  expect(result).toEqual({ mode: 'override', warning: undefined })
  expect(audioCoverMocks.writeAudioCoverWithBackup).not.toHaveBeenCalled()
  expect(getMediaThumbnailOverride(db, 'D:\\Music\\Song.wav')).toBe(
    'C:\\ArkManagerTest\\cache\\cover.webp'
  )
})
```

- [ ] **Step 4: Run Task 1 tests and verify RED**

Run:

```bash
npx vitest run electron/main/media/audioCover.test.ts electron/main/ipc/mediaThumbnailHandlers.test.ts
```

Expected: FAIL because WAV is still reported as embeddable, unsupported arguments do not throw, the dependency has no hash/reporter functions, restored backups are retained, and the handler invokes the mocked embedded writer for WAV.

- [ ] **Step 5: Implement WAV routing and streaming SHA-256**

In `audioCover.ts`, restrict support and guard argument generation:

```ts
const EMBEDDABLE_AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a'])

export function buildAudioCoverArgs(filePath: string, imagePath: string, outputPath: string): string[] {
  if (getAudioCoverWriteSupport(filePath) === 'unsupported') {
    throw new Error('Unsupported audio cover format')
  }
  if (extname(filePath).toLowerCase() === '.mp3') {
    return [
      '-y', '-i', filePath, '-i', imagePath,
      '-map', '0:a', '-map', '1:v', '-c', 'copy',
      '-id3v2_version', '3', outputPath,
    ]
  }
  return [
    '-y', '-i', filePath, '-i', imagePath,
    '-map', '0:a', '-map', '1:v', '-c', 'copy',
    '-disposition:v:0', 'attached_pic', outputPath,
  ]
}
```

Add a streaming hash helper so large WAV/FLAC files are not read fully into memory:

```ts
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}
```

Wire `hashFile: sha256File` and `reportError: (error) => console.error('Audio cover embedding failed', error)` into default dependencies.

- [ ] **Step 6: Implement verified recovery cleanup and concise warnings**

Call `deps.reportError(error)` when entering the failure path. After successful `restoreBackup`, hash the destination and backup. Remove the backup only when equal. Treat hash or backup-removal errors as recovery warnings, not source-restoration failures. Preserve `AudioCoverRestoreError` only for restoration failure.

```ts
await deps.restoreBackup(backupPath, filePath)
const [restoredHash, backupHash] = await Promise.all([
  deps.hashFile(filePath),
  deps.hashFile(backupPath),
])
if (restoredHash === backupHash) {
  await deps.removeFile(backupPath)
} else {
  warning = 'Audio cover embedding failed; the recovery backup was retained because restoration could not be verified.'
}
```

Log the original exception through `console.error` for development diagnostics, but return only concise fixed warning text to the renderer.

- [ ] **Step 7: Run Task 1 tests and related media tests**

Run:

```bash
npx vitest run electron/main/media/audioCover.test.ts electron/main/ipc/mediaThumbnailHandlers.test.ts electron/main/media/resolveMediaThumbnail.test.ts electron/main/mediaThumbnailProtocol.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add electron/main/media/audioCover.ts electron/main/media/audioCover.test.ts electron/main/ipc/mediaThumbnailHandlers.test.ts
git commit -m "fix: use app-local covers for wav files"
```

---

### Task 2: Unique Dialog Instance Keys

**Files:**
- Create: `src/components/game/dialogInstanceKey.ts`
- Create: `src/components/game/dialogInstanceKey.test.ts`
- Modify: `src/components/game/DetailSidebar.tsx`
- Modify: `src/components/game/DetailOverlay.tsx`

**Interfaces:**
- Produces: `dialogInstanceKey(kind: string, identity?: string | null): string`
- Consumes: no earlier task interfaces

- [ ] **Step 1: Write the failing pure key tests**

```ts
import { describe, expect, it } from 'vitest'
import { dialogInstanceKey } from './dialogInstanceKey'

describe('dialogInstanceKey', () => {
  it('makes closed sibling keys unique by dialog kind', () => {
    expect(new Set([
      dialogInstanceKey('launch'),
      dialogInstanceKey('rename'),
      dialogInstanceKey('delete'),
      dialogInstanceKey('move'),
    ]).size).toBe(4)
  })

  it('keeps the active identity stable and namespaced', () => {
    expect(dialogInstanceKey('rating', 'VNV17')).toBe('rating:VNV17')
    expect(dialogInstanceKey('launch', 'VNV17')).toBe('launch:VNV17')
  })
})
```

- [ ] **Step 2: Run the key test and verify RED**

Run: `npx vitest run src/components/game/dialogInstanceKey.test.ts`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement the helper**

```ts
export function dialogInstanceKey(kind: string, identity?: string | null): string {
  return `${kind}:${identity ?? 'closed'}`
}
```

- [ ] **Step 4: Replace duplicate fallback keys**

In `DetailSidebar.tsx`, use distinct kinds for launch, rename, delete, and move:

```tsx
key={dialogInstanceKey('launch', configuringLaunch ? game.path : null)}
key={dialogInstanceKey('rename', dialogMode === 'rename' ? game.path : null)}
key={dialogInstanceKey('delete', dialogMode === 'delete' ? game.path : null)}
key={dialogInstanceKey('move', dialogMode === 'move' ? game.path : null)}
```

In `DetailOverlay.tsx`, use `rating`, `launch`, `link`, and `unlink` with the same active identities currently used.

- [ ] **Step 5: Prove no bad sibling fallback remains and run tests**

Run:

```powershell
rg -n "key=.*: 'closed'|: 'closed'\}" src/components/game/DetailSidebar.tsx src/components/game/DetailOverlay.tsx
npx vitest run src/components/game/dialogInstanceKey.test.ts
npm run typecheck
```

Expected: the `rg` command has no matches; tests and typecheck PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/components/game/dialogInstanceKey.ts src/components/game/dialogInstanceKey.test.ts src/components/game/DetailSidebar.tsx src/components/game/DetailOverlay.tsx
git commit -m "fix: give dialog siblings stable unique keys"
```

---

### Task 3: Keyboard-Layout-Safe Zoom In

**Files:**
- Create: `electron/main/zoomShortcuts.ts`
- Create: `electron/main/zoomShortcuts.test.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/main/ipc/mediaWindowHandlers.ts`

**Interfaces:**
- Produces: `isZoomInShortcut(input: ZoomInput): boolean`
- Produces: `installZoomInShortcut(webContents: ZoomableWebContents): void`
- Consumes: no earlier task interfaces

- [ ] **Step 1: Write failing shortcut-recognition tests**

Define structural test inputs instead of importing a live Electron object:

```ts
it.each([
  { key: '=', code: 'Equal', control: true, meta: false, shift: false },
  { key: '+', code: 'Equal', control: true, meta: false, shift: true },
  { key: '+', code: 'NumpadAdd', control: true, meta: false, shift: false },
  { key: '=', code: 'Equal', control: false, meta: true, shift: false },
])('recognizes zoom-in input %#', (input) => {
  expect(isZoomInShortcut({ type: 'keyDown', alt: false, ...input })).toBe(true)
})

it.each([
  { type: 'keyDown', key: '-', code: 'Minus', control: true, meta: false, alt: false },
  { type: 'keyDown', key: '=', code: 'Equal', control: false, meta: false, alt: false },
  { type: 'keyDown', key: '=', code: 'Equal', control: true, meta: false, alt: true },
  { type: 'keyUp', key: '+', code: 'Equal', control: true, meta: false, alt: false },
])('rejects non-zoom input %#', (input) => {
  expect(isZoomInShortcut(input)).toBe(false)
})
```

- [ ] **Step 2: Write the failing installer behavior test**

Capture the registered `before-input-event` callback using a fake webContents object. Assert that a recognized input prevents the native event and changes zoom from `0` to `0.5` exactly once; rejected input must do neither. Add a destroyed-webContents case that does not read or set zoom.

- [ ] **Step 3: Run the zoom test and verify RED**

Run: `npx vitest run electron/main/zoomShortcuts.test.ts`

Expected: FAIL because `zoomShortcuts.ts` does not exist.

- [ ] **Step 4: Implement recognition and installation**

```ts
export interface ZoomInput {
  type: string
  key: string
  code: string
  control: boolean
  meta: boolean
  alt: boolean
}

export function isZoomInShortcut(input: ZoomInput): boolean {
  const commandModifier = input.control || input.meta
  const plusKey = input.code === 'Equal' || input.code === 'NumpadAdd' || input.key === '+'
  return input.type === 'keyDown' && commandModifier && !input.alt && plusKey
}
```

`installZoomInShortcut` registers one handler, calls `event.preventDefault()` for recognized input, returns when web contents is destroyed, and sets `getZoomLevel() + 0.5`.

- [ ] **Step 5: Install on main and detached player windows**

Call `installZoomInShortcut(win.webContents)` immediately after constructing the BrowserWindow in both `createWindow()` and `registerMediaWindowHandlers()`.

Do not replace the existing menu `resetZoom`, `zoomIn`, or `zoomOut` roles. The before-input event prevents duplicate keyboard handling while menu clicks retain native behavior.

- [ ] **Step 6: Run Task 3 verification**

Run:

```bash
npx vitest run electron/main/zoomShortcuts.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add electron/main/zoomShortcuts.ts electron/main/zoomShortcuts.test.ts electron/main/index.ts electron/main/ipc/mediaWindowHandlers.ts
git commit -m "fix: handle zoom-in keyboard variants"
```

---

### Task 4: Remove Unreferenced Legacy VNDB Caches

**Files:**
- Modify: `electron/main/database/migrateVndbCodePrefixes.ts`
- Modify: `electron/main/database/migrateVndbCodePrefixes.test.ts`
- Modify: `electron/main/database/client.test.ts`

**Interfaces:**
- Preserves: `legacyVndbCodeToCanonical(value: string): string | null`
- Preserves: `migrateVndbCodePrefixes(sqlite: Database.Database): void`
- Adds internal: `collectReferencedLegacyCodes(sqlite): Set<string>`
- Consumes: no earlier task interfaces

- [ ] **Step 1: Add failing cache cleanup coverage to the client migration test**

In the existing idempotent migration fixture, insert cache-only rows such as:

```ts
metadataInsert.run(
  'VN1',
  'False filename cache',
  null,
  null,
  null,
  null,
  createdAt,
  createdAt
)
failureInsert.run('VN912', '["vndb"]', 'not_found', createdAt)
```

Keep `VN17` referenced through `game_user_data`/`path_code_overrides` and `VR20` referenced through `save_snapshot_labels`. Assert after `createDbClient`:

```ts
expect(metadataCodes).toEqual(['VNV17'])
expect(failureCodes).toEqual(['VNR20'])
expect(metadataCodes).not.toContain('VNV1')
expect(failureCodes).not.toContain('VNV912')
```

Run initialization twice and retain the existing equality assertion for idempotency.

- [ ] **Step 2: Make the canonical-conflict fixture explicitly referenced**

The existing `VN17` versus `VNV17` metadata conflict test must create `path_code_overrides` and insert a `VN17` reference. This distinguishes intentional conflict preservation from unreferenced cache cleanup. Continue asserting that both rows survive when the canonical destination already exists.

- [ ] **Step 3: Add a focused pure migration test for exact reference rules**

Use an in-memory better-sqlite3 database with all five migration tables. Insert:

- a `game_user_data` row with `key='VN17'`, `key_type='code'`;
- a path-keyed `game_user_data` value that happens to begin with `VN` but has `key_type='path'`;
- `path_code_overrides.code='VR20'`;
- `save_snapshot_labels.key='VN30'`;
- cache-only `VN1` and `VR2` metadata/failure rows.

Assert that only exact code-owned references preserve/migrate caches and path keys are never treated as legacy codes.

- [ ] **Step 4: Run migration tests and verify RED**

Run:

```bash
npx vitest run electron/main/database/migrateVndbCodePrefixes.test.ts electron/main/database/client.test.ts
```

Expected: FAIL because the current migration converts every cache row, including unreferenced `VN1` and `VN912`.

- [ ] **Step 5: Collect references before mutation**

At the start of the existing transaction, query the three user-owned sources and collect only exact legacy values accepted by `legacyVndbCodeToCanonical`:

```ts
const referenced = new Set<string>()

for (const row of sqlite.prepare(
  `SELECT key AS value FROM game_user_data WHERE key_type = 'code'
   UNION SELECT code AS value FROM path_code_overrides
   UNION SELECT key AS value FROM save_snapshot_labels`
).all() as { value: string }[]) {
  if (legacyVndbCodeToCanonical(row.value)) referenced.add(row.value)
}
```

The collection must occur before any table is updated.

- [ ] **Step 6: Delete only unreferenced cache rows**

For `game_metadata` and `metadata_failures`, inspect each exact legacy key before the existing insert/delete migration:

```ts
if (!referenced.has(legacyKey)) {
  deleteSource.run(...migration.deleteColumns.map((column) => row[column]))
  continue
}
```

Do not apply this cache-deletion branch to `game_user_data` or `save_snapshot_labels`. Their migration remains non-destructive and conflict-preserving. In the `game_user_data` migration loop, skip a legacy-shaped key unless `row.key_type === 'code'`; path-owned keys must remain byte-for-byte unchanged. Path overrides continue updating in place.

- [ ] **Step 7: Run Task 4 and scanner regression tests**

Run:

```bash
npx vitest run electron/main/database/migrateVndbCodePrefixes.test.ts electron/main/database/client.test.ts electron/main/scanner/codeRecognition.test.ts electron/main/scanner/folderScanner.test.ts
npm run typecheck
```

Expected: PASS. The scanner tests must still reject `Game_v912.exe`, `Title v1.0.4`, `v8_context_snapshot.bin`, and `model_v2.index`.

- [ ] **Step 8: Commit Task 4**

```bash
git add electron/main/database/migrateVndbCodePrefixes.ts electron/main/database/migrateVndbCodePrefixes.test.ts electron/main/database/client.test.ts
git commit -m "fix: discard unreferenced legacy VNDB caches"
```

---

### Task 5: Full Regression and Release Verification

**Files:**
- Modify only files required to fix failures directly caused by Tasks 1-4

**Interfaces:**
- Consumes: all prior task deliverables
- Produces: verified `1.1.0` release candidate behavior

- [ ] **Step 1: Run the complete targeted regression set**

Run:

```bash
npx vitest run electron/main/media/audioCover.test.ts electron/main/ipc/mediaThumbnailHandlers.test.ts electron/main/media/resolveMediaThumbnail.test.ts electron/main/mediaThumbnailProtocol.test.ts src/components/game/dialogInstanceKey.test.ts electron/main/zoomShortcuts.test.ts electron/main/database/migrateVndbCodePrefixes.test.ts electron/main/database/client.test.ts electron/main/scanner/codeRecognition.test.ts electron/main/scanner/folderScanner.test.ts
```

Expected: PASS.

- [ ] **Step 2: Scan source for forbidden regressions**

Run:

```powershell
rg -n "ark-cover-work.*wav|\['\.mp3', '\.flac', '\.m4a', '\.wav'\]|key=.*: 'closed'|\[vr\]\\d" electron src shared -g '*.ts' -g '*.tsx'
```

Expected: no WAV embedding declaration, duplicate sibling fallback, or bare filename-recognition pattern. Search-only shorthand in `parseCodeInput.ts` and intentional migration tests are allowed.

- [ ] **Step 3: Run project-wide verification**

Run:

```bash
npm run typecheck
npm run lint
npm test
```

Expected: typecheck and tests pass. Lint has no errors and no new warnings beyond the pre-existing Fast Refresh warning in `src/components/ui/button.tsx`.

- [ ] **Step 4: Reproduce the reported library scan read-only**

Run this read-only scan and filter by recognized code instead of embedding locale-sensitive path text in the command:

```powershell
.\node_modules\.bin\tsx.cmd -e "import { scanLibraryRecursive } from './electron/main/scanner/folderScanner.ts'; void (async()=>{ const entries=await scanLibraryRecursive('D:\\ark\\ehddls'); console.log(JSON.stringify(entries.filter((entry)=>entry.code),null,2)); })();"
```

Expected: one entry per recognized game root and no `Game_v912.exe` or internal resource entries. Manually confirm the reported `アームズブレス` tree appears once rather than once per descendant folder.

- [ ] **Step 5: Inspect the user DB read-only without starting the packaged app**

Open `%APPDATA%\ark-manager\ark-manager.db` with better-sqlite3 `{ readonly: true, fileMustExist: true }`. Report which exact legacy codes are referenced by `game_user_data`, `path_code_overrides`, and `save_snapshot_labels`, and which cache-only rows will be deleted. Do not call `createDbClient` on this path.

Expected for the inspected current state: `VN13774` and `VN751` are referenced path overrides; cache-only rows include `VN1`, `VN2`, `VN3`, `VN8`, and `VN912`.

- [ ] **Step 6: Build the Windows installer**

Verify both manifests remain `1.1.0`, then run:

```bash
npm run build
```

Expected: `dist/Ark Manager Setup 1.1.0.exe` and its blockmap are generated. Do not launch the app during verification.

- [ ] **Step 7: Commit verification-only fixes only when needed**

If Steps 1-6 require a directly related code correction, stage only those files and commit:

```bash
git add -u -- electron src shared
git commit -m "fix: complete media and legacy cleanup"
```

If no fixes are needed, do not create an empty commit.
