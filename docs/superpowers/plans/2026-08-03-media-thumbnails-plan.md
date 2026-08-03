# Media Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Media-tab list rows real thumbnails (video keyframe, or audio's embedded art / same-folder image), let audio playback use the same large full-screen view video already has, and make a code-linked game's crawled cover win over a random image in its own folder.

**Architecture:** A new `mediathumb://` Electron protocol resolves a media file's thumbnail server-side in one priority chain (manual override row → ffmpeg auto-extraction, cached to disk as webp → for audio only, a same-folder image) and streams the bytes back with no IPC round trip, mirroring the existing `thumb://`/`media://` protocols exactly. The renderer never implements the priority logic itself — it just requests the URL and falls back to a default icon on 404, the same pattern `GameThumbnail.tsx` already uses for `thumb://`.

**Tech Stack:** Electron custom protocols, `ffmpeg-static` + `execFile` (no shell), `sharp` (already a dependency) for webp caching, drizzle-orm/better-sqlite3 hand-written DDL, Zustand/TanStack Query, Vitest with dependency-injection tests for anything not requiring a live ffmpeg binary.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-03-media-thumbnails-design.md` (committed as `4f0bc64`).
- Priority order (both video and audio): manual override → auto-extraction (video keyframe / audio embedded art) → for audio only, a same-folder image → default icon. Video has no directory-image tier.
- ffmpeg video-frame command: `ffmpeg -y -ss 00:00:01 -i <videoPath> -frames:v 1 -q:v 2 <outputPath>`.
- ffmpeg audio-art command: `ffmpeg -y -i <audioPath> -an -vcodec copy <outputPath>`.
- All extraction/caching goes through `execFile` with an argument array (never a shell string) and reuses `saveCustomCoverImage` (`electron/main/customCover/saveCustomCoverImage.ts`) for the actual webp write — no new image-writing code.
- Auto-extraction cache dir: `{userData}/cache/media-thumbnails`. Manual-override cache dir: `{userData}/cache/media-thumbnail-overrides`. These stay physically separate directories.
- No DB row tracks the auto-extraction cache — file existence on disk is the cache, same as `thumb://`'s own `findThumbnailPath`. Only the manual override is a DB row (`media_thumbnail_overrides`, hand-written `CREATE TABLE IF NOT EXISTS` in `client.ts`, no drizzle-kit migration, following every prior table this project added).
- No auto-expand to fullscreen for audio — only video auto-expands. The docked bar's expand button works for both.
- No component/hook test infrastructure exists anywhere in this codebase — only pure-logic `.test.ts` files (protocol handlers get a DI-testable pure function extracted, same as `mediaProtocol.ts`'s `buildMediaResponse`; anything shelling out to a real ffmpeg binary gets no test file at all, matching `readExeFileVersion.ts`'s own precedent; pure UI/component changes are manual `npm run dev` verification only).
- Main-process user-facing strings are hardcoded Korean literals, no i18n (see `saveHandlers.ts`'s existing error strings) — the one new IPC error string in this plan follows that.
- Renderer-facing strings go through `src/i18n/translations.ts`'s three locale blocks (ko/ja/en).
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure

- `electron/main/media/extractVideoFrame.ts` (new) — ffmpeg video-frame extraction, no test file.
- `electron/main/media/extractAudioArt.ts` (new) — ffmpeg embedded-art extraction, no test file.
- `electron/main/media/resolveMediaThumbnail.ts` (new) + `.test.ts` — auto-extraction cache/fallback orchestration, DI-tested.
- `electron/main/database/schema.ts` (modify) — `mediaThumbnailOverrides` table.
- `electron/main/database/client.ts` (modify) — matching `CREATE TABLE IF NOT EXISTS`.
- `electron/main/database/mediaThumbnailOverridesRepository.ts` (new) + `.test.ts` — single-column key lookup + upsert, mirrors `pathCodeOverridesRepository.ts`.
- `electron/main/mediaThumbnailProtocol.ts` (new) + `.test.ts` — the `mediathumb://` protocol, mirrors `thumbnailProtocol.ts`/`mediaProtocol.ts`.
- `src/services/mediaThumbnailProtocolService.ts` (new) — `buildMediaThumbnailUrl`, mirrors `thumbnailService.ts`/`mediaProtocolService.ts`.
- `electron/main/ipc/mediaThumbnailHandlers.ts` (new) — manual-override pick/set-from-file IPC, mirrors `gameUserDataHandlers.ts`'s custom-cover handlers.
- `shared/types/ipc.ts` (modify) — 2 new `IPC_CHANNELS`, 1 new request schema.
- `electron/preload/index.ts` (modify) — `api.mediaThumbnail` namespace.
- `electron/main/index.ts` (modify) — register the new scheme, protocol handler, and IPC handlers.
- `src/services/mediaThumbnailService.ts` (new) — `usePickMediaThumbnailFile`/`useSetMediaThumbnailFromFile` mutations.
- `src/pages/Media/MediaPage.tsx` (modify) — extracts a `MediaTrackRow` with a thumbnail + manual-picker button.
- `src/i18n/translations.ts` (modify) — `media.setThumbnail` × 3 locales.
- `src/components/media/FullscreenVideoOverlay.tsx` → `src/components/media/FullscreenMediaOverlay.tsx` (rename + rewrite) — audio support.
- `src/components/media/MediaPlayerBar.tsx` (modify) — drops the now-unused `mediaRef` prop and the video-only expand-button gate.
- `src/components/media/MediaPlayerHost.tsx` (modify) — `mediaExpanded` starts `false`, overlay mounts unconditionally.
- `src/pages/PlayerWindow/PlayerWindowPage.tsx` (modify) — detached audio view shows the real thumbnail instead of a static icon.
- `src/components/game/GameThumbnail.tsx` (modify) — `useFallback` gains `|| !!entry.code`.
- `package.json` (modify) — `ffmpeg-static` dependency.

---

### Task 1: ffmpeg extraction functions

**Files:**
- Modify: `package.json`
- Create: `electron/main/media/extractVideoFrame.ts`
- Create: `electron/main/media/extractAudioArt.ts`

**Interfaces:**
- Produces: `extractVideoFrame(videoPath: string, outputPath: string): Promise<boolean>`, `extractAudioArt(audioPath: string, outputPath: string): Promise<boolean>` — both resolve `true` on success, `false` on any failure (missing binary, non-zero exit, timeout), never throw.

No test file for this task — shelling out to a real ffmpeg binary against real media isn't something a unit test can usefully cover without either a slow integration test or a mock that only proves itself was called. This is the exact same precedent `electron/main/save/readExeFileVersion.ts` already established in this codebase (no `.test.ts` file exists for it either) — its behavior is exercised indirectly through `resolveMediaThumbnail`'s dependency-injection tests (Task 2) and later through live `npm run dev` verification.

- [ ] **Step 1: Install ffmpeg-static**

Run: `npm install ffmpeg-static`

`ffmpeg-static` ships its own TypeScript declarations (`types/index.d.ts`, default-exports the absolute path to the platform's bundled ffmpeg binary as a string) — no `@types/ffmpeg-static` needed.

- [ ] **Step 2: Write extractVideoFrame.ts**

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

// Grabs a single frame 1 second into the video as the thumbnail source - a
// fixed offset avoids needing to probe the video's duration first; ffmpeg's
// own end-of-stream handling still produces a frame for a video shorter
// than 1s. execFile takes an argument array (never a shell string, unlike
// readExeFileVersion.ts's PowerShell exec which needed careful quoting) -
// nothing here is vulnerable to shell metacharacter injection from a
// crafted file path.
export async function extractVideoFrame(videoPath: string, outputPath: string): Promise<boolean> {
  if (!ffmpegPath) return false
  try {
    await execFileAsync(
      ffmpegPath,
      ['-y', '-ss', '00:00:01', '-i', videoPath, '-frames:v', '1', '-q:v', '2', outputPath],
      { timeout: 15000 }
    )
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 3: Write extractAudioArt.ts**

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

// Extracts an attached-picture stream (ID3 APIC for MP3, similar tags for
// FLAC/OGG/M4A - ffmpeg handles the per-format differences itself) if the
// audio file has one embedded. Fails (returns false, not an error) exactly
// as often as a file simply has no embedded art - same "false = nothing
// available, try the next tier" contract as extractVideoFrame.
export async function extractAudioArt(audioPath: string, outputPath: string): Promise<boolean> {
  if (!ffmpegPath) return false
  try {
    await execFileAsync(
      ffmpegPath,
      ['-y', '-i', audioPath, '-an', '-vcodec', 'copy', outputPath],
      { timeout: 15000 }
    )
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors mentioning `ffmpeg-static`, `extractVideoFrame.ts`, or `extractAudioArt.ts`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron/main/media/extractVideoFrame.ts electron/main/media/extractAudioArt.ts
git commit -m "$(cat <<'EOF'
feat: add ffmpeg-based video frame and audio art extraction

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: resolveMediaThumbnail (auto-extraction cache + fallback)

**Files:**
- Create: `electron/main/media/resolveMediaThumbnail.ts`
- Test: `electron/main/media/resolveMediaThumbnail.test.ts`

**Interfaces:**
- Consumes: `extractVideoFrame`/`extractAudioArt` (Task 1, exact signatures above), `findThumbnailPath(folderPath: string): Promise<string | null>` (existing, `electron/main/scanner/thumbnail.ts`), `keyToSafeDirName(key: string): string` (existing, `electron/main/save/keyToSafeDirName.ts`), `saveCustomCoverImage(cacheDir: string, key: string, imageBuffer: Buffer): Promise<string>` (existing, `electron/main/customCover/saveCustomCoverImage.ts`).
- Produces: `resolveMediaThumbnail(cacheDir: string, filePath: string, isVideo: boolean, deps?: ResolveMediaThumbnailDeps): Promise<string | null>` and the exported `ResolveMediaThumbnailDeps` interface (`{ extractVideoFrame, extractAudioArt, findThumbnailPath }`, same shapes as above) — Task 4 imports both.

- [ ] **Step 1: Write the failing tests**

```ts
// electron/main/media/resolveMediaThumbnail.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { resolveMediaThumbnail } from './resolveMediaThumbnail'

async function writeFakeFrame(outputPath: string): Promise<void> {
  await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
    .png()
    .toFile(outputPath)
}

describe('resolveMediaThumbnail', () => {
  let dir: string
  let cacheDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-thumb-'))
    cacheDir = join(dir, 'cache')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('extracts and caches a video frame on first request', async () => {
    const videoPath = join(dir, 'clip.mp4')
    await writeFile(videoPath, '')
    let calls = 0
    const deps = {
      extractVideoFrame: async (_video: string, outputPath: string) => {
        calls++
        await writeFakeFrame(outputPath)
        return true
      },
      extractAudioArt: async () => false,
      findThumbnailPath: async () => null,
    }

    const result = await resolveMediaThumbnail(cacheDir, videoPath, true, deps)

    expect(result).not.toBeNull()
    expect(calls).toBe(1)
    await expect(access(result!)).resolves.toBeUndefined()
  })

  it('reuses the cached file on a second request instead of extracting again', async () => {
    const videoPath = join(dir, 'clip.mp4')
    await writeFile(videoPath, '')
    let calls = 0
    const deps = {
      extractVideoFrame: async (_video: string, outputPath: string) => {
        calls++
        await writeFakeFrame(outputPath)
        return true
      },
      extractAudioArt: async () => false,
      findThumbnailPath: async () => null,
    }

    const first = await resolveMediaThumbnail(cacheDir, videoPath, true, deps)
    const second = await resolveMediaThumbnail(cacheDir, videoPath, true, deps)

    expect(second).toBe(first)
    expect(calls).toBe(1)
  })

  it('returns null for a video with no extractable frame, without trying a directory image', async () => {
    const videoPath = join(dir, 'clip.mp4')
    await writeFile(videoPath, '')
    let findThumbnailCalls = 0
    const deps = {
      extractVideoFrame: async () => false,
      extractAudioArt: async () => false,
      findThumbnailPath: async () => {
        findThumbnailCalls++
        return null
      },
    }

    const result = await resolveMediaThumbnail(cacheDir, videoPath, true, deps)

    expect(result).toBeNull()
    expect(findThumbnailCalls).toBe(0)
  })

  it('extracts and caches embedded audio art on first request', async () => {
    const audioPath = join(dir, 'song.mp3')
    await writeFile(audioPath, '')
    const deps = {
      extractVideoFrame: async () => false,
      extractAudioArt: async (_audio: string, outputPath: string) => {
        await writeFakeFrame(outputPath)
        return true
      },
      findThumbnailPath: async () => null,
    }

    const result = await resolveMediaThumbnail(cacheDir, audioPath, false, deps)

    expect(result).not.toBeNull()
    await expect(access(result!)).resolves.toBeUndefined()
  })

  it('falls back to a directory image when an audio file has no embedded art', async () => {
    const audioPath = join(dir, 'song.mp3')
    await writeFile(audioPath, '')
    const folderImage = join(dir, 'cover.jpg')
    await writeFile(folderImage, '')
    const deps = {
      extractVideoFrame: async () => false,
      extractAudioArt: async () => false,
      findThumbnailPath: async (folderPath: string) => (folderPath === dir ? folderImage : null),
    }

    const result = await resolveMediaThumbnail(cacheDir, audioPath, false, deps)

    expect(result).toBe(folderImage)
  })

  it('returns null when an audio file has neither embedded art nor a directory image', async () => {
    const audioPath = join(dir, 'song.mp3')
    await writeFile(audioPath, '')
    const deps = {
      extractVideoFrame: async () => false,
      extractAudioArt: async () => false,
      findThumbnailPath: async () => null,
    }

    const result = await resolveMediaThumbnail(cacheDir, audioPath, false, deps)

    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/main/media/resolveMediaThumbnail.test.ts`
Expected: FAIL — `resolveMediaThumbnail.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// electron/main/media/resolveMediaThumbnail.ts
import { access, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { keyToSafeDirName } from '../save/keyToSafeDirName'
import { saveCustomCoverImage } from '../customCover/saveCustomCoverImage'
import { extractVideoFrame as defaultExtractVideoFrame } from './extractVideoFrame'
import { extractAudioArt as defaultExtractAudioArt } from './extractAudioArt'
import { findThumbnailPath as defaultFindThumbnailPath } from '../scanner/thumbnail'

export interface ResolveMediaThumbnailDeps {
  extractVideoFrame: (videoPath: string, outputPath: string) => Promise<boolean>
  extractAudioArt: (audioPath: string, outputPath: string) => Promise<boolean>
  findThumbnailPath: (folderPath: string) => Promise<string | null>
}

const defaultDeps: ResolveMediaThumbnailDeps = {
  extractVideoFrame: defaultExtractVideoFrame,
  extractAudioArt: defaultExtractAudioArt,
  findThumbnailPath: defaultFindThumbnailPath,
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// Auto-extraction tier of the media-thumbnail priority chain (see
// docs/superpowers/specs/2026-08-03-media-thumbnails-design.md section 2) -
// the manual-override tier is checked by the protocol handler BEFORE this
// ever runs (mediaThumbnailProtocol.ts), not here. Caches to
// {cacheDir}/{hash of filePath}.webp via saveCustomCoverImage (the exact
// same cache-write helper game covers already use) - file existence on disk
// IS the cache, same design as thumb://'s own findThumbnailPath, so a
// second request for the same file skips straight past ffmpeg entirely.
export async function resolveMediaThumbnail(
  cacheDir: string,
  filePath: string,
  isVideo: boolean,
  deps: ResolveMediaThumbnailDeps = defaultDeps
): Promise<string | null> {
  const cachePath = join(cacheDir, `${keyToSafeDirName(filePath)}.webp`)
  if (await pathExists(cachePath)) return cachePath

  await mkdir(cacheDir, { recursive: true })
  const tempPath = join(cacheDir, `${keyToSafeDirName(filePath)}.tmp`)

  const extracted = isVideo
    ? await deps.extractVideoFrame(filePath, tempPath)
    : await deps.extractAudioArt(filePath, tempPath)

  if (extracted) {
    try {
      const buffer = await readFile(tempPath)
      return await saveCustomCoverImage(cacheDir, filePath, buffer)
    } catch {
      return null
    } finally {
      await rm(tempPath, { force: true })
    }
  }

  // Video has no directory-image tier - a frame from the video itself is
  // always the more relevant thumbnail when available, and a stray folder
  // image next to a video file is far less likely to actually be "this
  // video's cover" than the same is for a music folder (see spec section 1).
  if (!isVideo) {
    const directoryImage = await deps.findThumbnailPath(dirname(filePath))
    if (directoryImage) return directoryImage
  }

  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/main/media/resolveMediaThumbnail.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add electron/main/media/resolveMediaThumbnail.ts electron/main/media/resolveMediaThumbnail.test.ts
git commit -m "$(cat <<'EOF'
feat: add resolveMediaThumbnail auto-extraction cache

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: media_thumbnail_overrides table + repository

**Files:**
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/client.ts`
- Create: `electron/main/database/mediaThumbnailOverridesRepository.ts`
- Test: `electron/main/database/mediaThumbnailOverridesRepository.test.ts`

**Interfaces:**
- Produces: `getMediaThumbnailOverride(db: AppDatabase, filePath: string): string | null`, `setMediaThumbnailOverride(db: AppDatabase, filePath: string, thumbnailPath: string): void` — Task 4 (protocol) and Task 5 (IPC) both import these.

- [ ] **Step 1: Add the schema table**

In `electron/main/database/schema.ts`, add after `saveSnapshotLabels`:

```ts
export const mediaThumbnailOverrides = sqliteTable('media_thumbnail_overrides', {
  path: text('path').primaryKey(), // the media file's own absolute path
  thumbnailPath: text('thumbnail_path').notNull(),
})
```

- [ ] **Step 2: Add the CREATE TABLE statement**

In `electron/main/database/client.ts`, add after the `save_snapshot_labels` block (before `return drizzle(...)`):

```ts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS media_thumbnail_overrides (
      path TEXT PRIMARY KEY,
      thumbnail_path TEXT NOT NULL
    )
  `)
```

- [ ] **Step 3: Write the failing repository tests**

```ts
// electron/main/database/mediaThumbnailOverridesRepository.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import {
  getMediaThumbnailOverride,
  setMediaThumbnailOverride,
} from './mediaThumbnailOverridesRepository'

describe('mediaThumbnailOverridesRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns null when no override exists for a path', () => {
    expect(getMediaThumbnailOverride(db, 'd:\\media\\song.mp3')).toBeNull()
  })

  it('stores and retrieves an override', () => {
    setMediaThumbnailOverride(db, 'd:\\media\\song.mp3', 'd:\\cache\\abc.webp')
    expect(getMediaThumbnailOverride(db, 'd:\\media\\song.mp3')).toBe('d:\\cache\\abc.webp')
  })

  it('overwrites an existing override for the same path', () => {
    setMediaThumbnailOverride(db, 'd:\\media\\song.mp3', 'd:\\cache\\abc.webp')
    setMediaThumbnailOverride(db, 'd:\\media\\song.mp3', 'd:\\cache\\def.webp')
    expect(getMediaThumbnailOverride(db, 'd:\\media\\song.mp3')).toBe('d:\\cache\\def.webp')
  })

  it('does not affect an override for a different path', () => {
    setMediaThumbnailOverride(db, 'd:\\media\\keep.mp3', 'd:\\cache\\keep.webp')
    setMediaThumbnailOverride(db, 'd:\\media\\other.mp3', 'd:\\cache\\other.webp')
    expect(getMediaThumbnailOverride(db, 'd:\\media\\keep.mp3')).toBe('d:\\cache\\keep.webp')
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run electron/main/database/mediaThumbnailOverridesRepository.test.ts`
Expected: FAIL — the repository module does not exist yet.

- [ ] **Step 5: Write the implementation**

```ts
// electron/main/database/mediaThumbnailOverridesRepository.ts
import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { mediaThumbnailOverrides } from './schema'

export function getMediaThumbnailOverride(db: AppDatabase, filePath: string): string | null {
  const row = db
    .select({ thumbnailPath: mediaThumbnailOverrides.thumbnailPath })
    .from(mediaThumbnailOverrides)
    .where(eq(mediaThumbnailOverrides.path, filePath))
    .get()
  return row?.thumbnailPath ?? null
}

export function setMediaThumbnailOverride(
  db: AppDatabase,
  filePath: string,
  thumbnailPath: string
): void {
  db.insert(mediaThumbnailOverrides)
    .values({ path: filePath, thumbnailPath })
    .onConflictDoUpdate({ target: mediaThumbnailOverrides.path, set: { thumbnailPath } })
    .run()
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run electron/main/database/mediaThumbnailOverridesRepository.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 7: Commit**

```bash
git add electron/main/database/schema.ts electron/main/database/client.ts electron/main/database/mediaThumbnailOverridesRepository.ts electron/main/database/mediaThumbnailOverridesRepository.test.ts
git commit -m "$(cat <<'EOF'
feat: add media_thumbnail_overrides table and repository

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: mediathumb:// protocol

**Files:**
- Create: `electron/main/mediaThumbnailProtocol.ts`
- Test: `electron/main/mediaThumbnailProtocol.test.ts`
- Create: `src/services/mediaThumbnailProtocolService.ts`
- Modify: `electron/main/index.ts`

**Interfaces:**
- Consumes: `resolveMediaThumbnail` (Task 2), `getMediaThumbnailOverride` (Task 3), `isPathWithinAnyLibrary(entryPath: string, libraryPaths: string[]): boolean` (existing, `electron/main/thumbnailProtocol.ts`), `isVideoFile(name: string): boolean` (existing, `shared/isMediaFile.ts`), `listLibraries(db): Library[]` (existing), `getSetting(db, key)` (existing).
- Produces: `buildMediaThumbnailResponse(filePath, allowedRoots, cacheDir, getOverride, resolve?): Promise<Response>` (exported for the test), `registerMediaThumbnailProtocolScheme(): void`, `registerMediaThumbnailProtocolHandler(db: AppDatabase): void`, `mediaThumbnailCacheDir(): string`. `buildMediaThumbnailUrl(filePath: string): string` in the new renderer-side service file — Tasks 6 and 7 both import it.

- [ ] **Step 1: Write the failing protocol tests**

```ts
// electron/main/mediaThumbnailProtocol.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMediaThumbnailResponse } from './mediaThumbnailProtocol'

describe('buildMediaThumbnailResponse', () => {
  let libraryDir: string
  let filePath: string
  let cacheDir: string

  beforeEach(async () => {
    libraryDir = await mkdtemp(join(tmpdir(), 'ark-manager-mediathumb-'))
    filePath = join(libraryDir, 'clip.mp4')
    await writeFile(filePath, '')
    cacheDir = join(libraryDir, 'cache')
  })

  afterEach(async () => {
    await rm(libraryDir, { recursive: true, force: true })
  })

  it('returns 404 for a path outside every allowed root', async () => {
    const response = await buildMediaThumbnailResponse(
      filePath,
      ['D:\\SomeOtherLibrary'],
      cacheDir,
      () => null
    )
    expect(response.status).toBe(404)
  })

  it('serves the manual override without calling resolve', async () => {
    const overrideImage = join(libraryDir, 'override.webp')
    await writeFile(overrideImage, 'fake-webp-bytes')
    let resolveCalls = 0
    const resolve = async () => {
      resolveCalls++
      return null
    }

    const response = await buildMediaThumbnailResponse(
      filePath,
      [libraryDir],
      cacheDir,
      () => overrideImage,
      resolve
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    expect(await response.text()).toBe('fake-webp-bytes')
    expect(resolveCalls).toBe(0)
  })

  it('falls back to resolve() when no override exists', async () => {
    const resolvedImage = join(libraryDir, 'frame.webp')
    await writeFile(resolvedImage, 'fake-frame-bytes')
    const resolve = async () => resolvedImage

    const response = await buildMediaThumbnailResponse(
      filePath,
      [libraryDir],
      cacheDir,
      () => null,
      resolve
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('fake-frame-bytes')
  })

  it('serves a non-webp directory-image fallback with the correct content type', async () => {
    const jpgImage = join(libraryDir, 'cover.jpg')
    await writeFile(jpgImage, 'fake-jpg-bytes')
    const resolve = async () => jpgImage

    const response = await buildMediaThumbnailResponse(
      filePath,
      [libraryDir],
      cacheDir,
      () => null,
      resolve
    )

    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
  })

  it('returns 404 when neither an override nor resolve() produces a thumbnail', async () => {
    const resolve = async () => null
    const response = await buildMediaThumbnailResponse(
      filePath,
      [libraryDir],
      cacheDir,
      () => null,
      resolve
    )
    expect(response.status).toBe(404)
  })

  it('returns 404 when the resolved path cannot actually be read', async () => {
    const resolve = async () => join(libraryDir, 'does-not-exist.webp')
    const response = await buildMediaThumbnailResponse(
      filePath,
      [libraryDir],
      cacheDir,
      () => null,
      resolve
    )
    expect(response.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/main/mediaThumbnailProtocol.test.ts`
Expected: FAIL — `mediaThumbnailProtocol.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// electron/main/mediaThumbnailProtocol.ts
import { readFile } from 'node:fs/promises'
import { app, protocol } from 'electron'
import { extname, join } from 'node:path'
import { isVideoFile } from '../../shared/isMediaFile'
import { isPathWithinAnyLibrary } from './thumbnailProtocol'
import { listLibraries } from './database/librariesRepository'
import { getSetting } from './database/settingsRepository'
import { getMediaThumbnailOverride } from './database/mediaThumbnailOverridesRepository'
import { resolveMediaThumbnail } from './media/resolveMediaThumbnail'
import type { AppDatabase } from './database/client'

const MEDIA_THUMBNAIL_SCHEME = 'mediathumb'

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

function decodeFilePath(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1))
}

export function mediaThumbnailCacheDir(): string {
  return join(app.getPath('userData'), 'cache', 'media-thumbnails')
}

// Decoupled from Electron's protocol/Request machinery (same reasoning as
// mediaProtocol.ts's buildMediaResponse) - getOverride/resolve are injected
// so a test can exercise the priority order (override wins, then
// auto-extraction, then 404) without a real database or a real ffmpeg call.
export async function buildMediaThumbnailResponse(
  filePath: string,
  allowedRoots: string[],
  cacheDir: string,
  getOverride: (filePath: string) => string | null,
  resolve: (
    cacheDir: string,
    filePath: string,
    isVideo: boolean
  ) => Promise<string | null> = resolveMediaThumbnail
): Promise<Response> {
  if (!isPathWithinAnyLibrary(filePath, allowedRoots)) {
    return new Response(null, { status: 404 })
  }

  const overridePath = getOverride(filePath)
  const resolvedPath = overridePath ?? (await resolve(cacheDir, filePath, isVideoFile(filePath)))
  if (!resolvedPath) return new Response(null, { status: 404 })

  try {
    const buffer = await readFile(resolvedPath)
    const mimeType = MIME_TYPES[extname(resolvedPath).toLowerCase()] ?? 'application/octet-stream'
    return new Response(buffer, { headers: { 'Content-Type': mimeType } })
  } catch {
    return new Response(null, { status: 404 })
  }
}

// Must run before app.whenReady() - Electron requires privileged schemes to
// be registered at module load time.
export function registerMediaThumbnailProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_THUMBNAIL_SCHEME,
      privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true },
    },
  ])
}

// Must run after app.whenReady(). Same trust boundary as media:// itself
// (mediaProtocol.ts) - a thumbnail is only ever generated for a file
// media:// would also be willing to serve in the first place (a registered
// library, or the one folder picked via the Media page).
export function registerMediaThumbnailProtocolHandler(db: AppDatabase): void {
  const cacheDir = mediaThumbnailCacheDir()
  protocol.handle(MEDIA_THUMBNAIL_SCHEME, async (request) => {
    const filePath = decodeFilePath(request.url)
    const libraryPaths = listLibraries(db).map((library) => library.path)
    const mediaFolder = getSetting(db, 'media-folder')
    const allowedRoots = mediaFolder ? [...libraryPaths, mediaFolder] : libraryPaths
    return buildMediaThumbnailResponse(filePath, allowedRoots, cacheDir, (path) =>
      getMediaThumbnailOverride(db, path)
    )
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/main/mediaThumbnailProtocol.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Write the renderer-side URL builder**

```ts
// src/services/mediaThumbnailProtocolService.ts
// Matches electron/main/mediaThumbnailProtocol.ts's decodeFilePath exactly
// (a plain encodeURIComponent of the file's own path) - kept as a pure
// function rather than a query hook, same reasoning as buildMediaUrl/
// buildThumbnailUrl: the <img> element loads this directly through
// Chromium's own network stack, no IPC round trip. Whether a thumbnail
// actually exists is only known once that request resolves (onError on the
// consuming <img>), not upfront - same as thumb://.
export function buildMediaThumbnailUrl(filePath: string): string {
  return `mediathumb://thumbnail/${encodeURIComponent(filePath)}`
}
```

- [ ] **Step 6: Wire the protocol into electron/main/index.ts**

Add the import alongside the existing protocol imports:

```ts
import {
  registerThumbnailProtocolHandler,
  registerThumbnailProtocolScheme,
} from './thumbnailProtocol'
import { registerMediaProtocolHandler, registerMediaProtocolScheme } from './mediaProtocol'
import {
  registerMediaThumbnailProtocolHandler,
  registerMediaThumbnailProtocolScheme,
} from './mediaThumbnailProtocol'
```

Register the scheme alongside the other two (before `app.whenReady()`):

```ts
  registerThumbnailProtocolScheme()
  registerMediaProtocolScheme()
  registerMediaThumbnailProtocolScheme()
```

Register the handler alongside the other two (inside `app.whenReady().then(...)`, right after `registerMediaProtocolHandler(db)`):

```ts
    registerThumbnailProtocolHandler(db)
    registerMediaProtocolHandler(db)
    registerMediaThumbnailProtocolHandler(db)
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add electron/main/mediaThumbnailProtocol.ts electron/main/mediaThumbnailProtocol.test.ts src/services/mediaThumbnailProtocolService.ts electron/main/index.ts
git commit -m "$(cat <<'EOF'
feat: add mediathumb:// protocol for media file thumbnails

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Manual thumbnail override IPC

**Files:**
- Modify: `shared/types/ipc.ts`
- Create: `electron/main/ipc/mediaThumbnailHandlers.ts`
- Modify: `electron/preload/index.ts`
- Modify: `electron/main/index.ts`

**Interfaces:**
- Consumes: `setMediaThumbnailOverride` (Task 3), `saveCustomCoverImage` (existing).
- Produces: `IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE`, `IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE`, `window.api.mediaThumbnail.pickFile(): Promise<string | null>`, `window.api.mediaThumbnail.setFromFile(filePath: string, sourcePath: string): Promise<void>` — Task 6 imports these.

No automated test for the IPC handler file itself (no precedent for testing an IPC-handler-registration file directly anywhere in this codebase — `gameUserDataHandlers.ts`, the closest analog, has none either; the DB layer underneath is already covered by Task 3's repository test). This gets exercised live in Task 6's manual verification.

- [ ] **Step 1: Add IPC channels and request schema**

In `shared/types/ipc.ts`, add two entries to `IPC_CHANNELS` right after `MEDIA_REPORT_TIME`:

```ts
  MEDIA_REPORT_TIME: 'media:report-time',
  MEDIA_THUMBNAIL_PICK_FILE: 'media-thumbnail:pick-file',
  MEDIA_THUMBNAIL_SET_FROM_FILE: 'media-thumbnail:set-from-file',
```

Add the request schema anywhere after `MediaReportTimeRequestSchema`:

```ts
export const SetMediaThumbnailFromFileRequestSchema = z.object({
  filePath: z.string(),
  sourcePath: z.string(),
})
export type SetMediaThumbnailFromFileRequest = z.infer<
  typeof SetMediaThumbnailFromFileRequestSchema
>
```

- [ ] **Step 2: Write the IPC handlers**

```ts
// electron/main/ipc/mediaThumbnailHandlers.ts
import { app, dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC_CHANNELS, SetMediaThumbnailFromFileRequestSchema } from '../../../shared/types/ipc'
import { setMediaThumbnailOverride } from '../database/mediaThumbnailOverridesRepository'
import { saveCustomCoverImage } from '../customCover/saveCustomCoverImage'
import type { AppDatabase } from '../database/client'

function mediaThumbnailOverrideCacheDir(): string {
  return join(app.getPath('userData'), 'cache', 'media-thumbnail-overrides')
}

export function registerMediaThumbnailHandlers(db: AppDatabase): void {
  // Same one-shot trust pattern as GAME_USER_DATA_SET_CUSTOM_COVER_FROM_FILE
  // (gameUserDataHandlers.ts) - without pinning to whatever the native file
  // picker most recently actually returned, a compromised or buggy renderer
  // could pass any locally-readable path and get it copied into the app's
  // cache and re-served as this file's thumbnail, an arbitrary local-file-
  // read primitive.
  let lastPickedThumbnailPath: string | null = null

  ipcMain.handle(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    lastPickedThumbnailPath = result.filePaths[0]
    return lastPickedThumbnailPath
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE, async (_event, payload: unknown) => {
    const { filePath, sourcePath } = SetMediaThumbnailFromFileRequestSchema.parse(payload)
    if (sourcePath !== lastPickedThumbnailPath) {
      throw new Error('선택된 파일이 아닙니다.')
    }
    lastPickedThumbnailPath = null
    const buffer = await readFile(sourcePath)
    const savedPath = await saveCustomCoverImage(mediaThumbnailOverrideCacheDir(), filePath, buffer)
    setMediaThumbnailOverride(db, filePath, savedPath)
  })
}
```

- [ ] **Step 3: Expose the API in the preload script**

In `electron/preload/index.ts`, add to the `IPC_CHANNELS` import destructuring nothing new is needed (it imports the whole `IPC_CHANNELS` object already). Add a new top-level key to the `api` object, after `media`:

```ts
  mediaThumbnail: {
    pickFile: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE),
    setFromFile: (filePath: string, sourcePath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE, { filePath, sourcePath }),
  },
```

- [ ] **Step 4: Register the handlers in electron/main/index.ts**

Add the import alongside the other IPC handler imports:

```ts
import { registerMediaThumbnailHandlers } from './ipc/mediaThumbnailHandlers'
```

Register it alongside the other `register*Handlers(db)` calls inside `app.whenReady().then(...)`, right after `registerMediaWindowHandlers(...)`'s line:

```ts
    closePlayerWindow = registerMediaWindowHandlers(() => mainWindow).closePlayerWindow
    registerMediaThumbnailHandlers(db)
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add shared/types/ipc.ts electron/main/ipc/mediaThumbnailHandlers.ts electron/preload/index.ts electron/main/index.ts
git commit -m "$(cat <<'EOF'
feat: add manual media thumbnail override IPC

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Media page list thumbnails + manual picker

**Files:**
- Create: `src/services/mediaThumbnailService.ts`
- Modify: `src/pages/Media/MediaPage.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `buildMediaThumbnailUrl` (Task 4), `window.api.mediaThumbnail.pickFile`/`setFromFile` (Task 5).
- Produces: `usePickMediaThumbnailFile()`, `useSetMediaThumbnailFromFile()` mutation hooks.

No automated test (no component test infrastructure exists in this codebase). Manually verified at the end of this plan (see the final Live Verification section).

- [ ] **Step 1: Write the mutation hooks**

```ts
// src/services/mediaThumbnailService.ts
import { useMutation } from '@tanstack/react-query'

export function usePickMediaThumbnailFile() {
  return useMutation({
    mutationFn: (): Promise<string | null> => window.api.mediaThumbnail.pickFile(),
  })
}

export function useSetMediaThumbnailFromFile() {
  return useMutation({
    mutationFn: ({ filePath, sourcePath }: { filePath: string; sourcePath: string }) =>
      window.api.mediaThumbnail.setFromFile(filePath, sourcePath),
  })
}
```

- [ ] **Step 2: Add the i18n key**

In `src/i18n/translations.ts`, add `'media.setThumbnail'` right after each locale block's `'media.addToPlaylist'` line:

Korean block (after line `'media.addToPlaylist': '재생목록에 추가',`):
```ts
  'media.addToPlaylist': '재생목록에 추가',
  'media.setThumbnail': '썸네일 설정',
```

Japanese block (after line `'media.addToPlaylist': '再生リストに追加',`):
```ts
  'media.addToPlaylist': '再生リストに追加',
  'media.setThumbnail': 'サムネイル設定',
```

English block (after line `'media.addToPlaylist': 'Add to playlist',`):
```ts
  'media.addToPlaylist': 'Add to playlist',
  'media.setThumbnail': 'Set thumbnail',
```

- [ ] **Step 3: Extract MediaTrackRow with a thumbnail and picker button**

Replace `src/pages/Media/MediaPage.tsx` in full:

```tsx
import { useState } from 'react'
import { ImagePlus, Play, Plus } from 'lucide-react'
import { usePickLibraryFolder } from '../../services/librariesService'
import { useFolderScanRecursive } from '../../services/scannerService'
import { useMediaFolderQuery, useSetMediaFolderMutation } from '../../services/settingsService'
import { useMediaPlayerStore, type MediaTrack } from '../../stores/mediaPlayerStore'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import {
  usePickMediaThumbnailFile,
  useSetMediaThumbnailFromFile,
} from '../../services/mediaThumbnailService'
import { isMediaFile } from '../../../shared/isMediaFile'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import { useTranslation } from '../../i18n/useTranslation'

// A single track row - thumbnail state (whether the current mediathumb://
// request 404'd, and a cache-busting counter bumped after the user manually
// sets a new thumbnail) is local to each row rather than lifted, since it's
// purely about that one row's own <img> element and this list isn't
// react-window-virtualized (a plain <ul>, unlike Gallery/List/DetailList) -
// no row recycling to worry about, unlike GameThumbnail's path-keyed
// failure tracking.
function MediaTrackRow({
  track,
  onPlay,
  onAddToPlaylist,
}: {
  track: MediaTrack
  onPlay: () => void
  onAddToPlaylist: () => void
}) {
  const { t } = useTranslation()
  const [thumbFailed, setThumbFailed] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const pickFile = usePickMediaThumbnailFile()
  const setFromFile = useSetMediaThumbnailFromFile()

  const handlePickThumbnail = async (): Promise<void> => {
    const sourcePath = await pickFile.mutateAsync()
    if (!sourcePath) return
    await setFromFile.mutateAsync({ filePath: track.path, sourcePath })
    // mediathumb:// is a plain URL, not a react-query cache entry - nothing
    // to invalidate. Bumping this query param forces the <img> to actually
    // re-request instead of reusing Chromium's cached response for the
    // previous (now-stale) bytes at the same URL.
    setThumbFailed(false)
    setRefreshToken((v) => v + 1)
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
        {!thumbFailed && (
          <img
            src={`${buildMediaThumbnailUrl(track.path)}?v=${refreshToken}`}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setThumbFailed(true)}
          />
        )}
      </div>
      <button
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onPlay}
      >
        <Play className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{track.name}</span>
      </button>
      <button
        aria-label={t('media.setThumbnail')}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={handlePickThumbnail}
      >
        <ImagePlus className="h-4 w-4" />
      </button>
      <button
        aria-label={t('media.addToPlaylist')}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onAddToPlaylist}
      >
        <Plus className="h-4 w-4" />
      </button>
    </li>
  )
}

// A dedicated browse-and-queue page, separate from Explorer's per-folder
// "click to play" entry point (see FolderView.tsx) - this one is for
// picking any folder (not necessarily a registered library) and building up
// a playlist from everything media-shaped found in it, recursively. The
// picked folder is persisted (see useMediaFolderQuery) rather than kept in
// local state, so navigating to another tab and back doesn't force picking
// it again - it's also what makes media:// willing to serve files from a
// non-library folder at all (see mediaProtocol.ts).
export function MediaPage() {
  const { t } = useTranslation()
  const { data: folder = null, isLoading: isFolderLoading } = useMediaFolderQuery()
  const setMediaFolder = useSetMediaFolderMutation()
  const pickFolder = usePickLibraryFolder()
  const { data: entries, isLoading } = useFolderScanRecursive(folder ?? '', {
    enabled: folder !== null,
  })
  const playNow = useMediaPlayerStore((s) => s.playNow)
  const addToPlaylist = useMediaPlayerStore((s) => s.addToPlaylist)

  const tracks: MediaTrack[] = (entries ?? [])
    .filter((e) => e.kind === 'file' && isMediaFile(e.name))
    .map((e) => ({ path: e.path, name: e.name }))

  const handlePickFolder = async (): Promise<void> => {
    const dir = await pickFolder.mutateAsync()
    if (dir) setMediaFolder.mutate(dir)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Button size="sm" variant="secondary" onClick={handlePickFolder}>
          {t('settings.pickFolder')}
        </Button>
        {folder && <span className="truncate text-xs text-muted-foreground">{folder}</span>}
        {tracks.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => addToPlaylist(tracks)}
          >
            {t('media.addAllToPlaylist')}
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {isFolderLoading ? null : folder === null ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t('media.pickFolderPrompt')}
          </div>
        ) : isLoading ? (
          <div className="flex flex-col gap-1 p-4">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t('media.noMediaFound')}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {tracks.map((track) => (
              <MediaTrackRow
                key={track.path}
                track={track}
                onPlay={() => playNow(track, tracks)}
                onAddToPlaylist={() => addToPlaylist([track])}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/mediaThumbnailService.ts src/pages/Media/MediaPage.tsx src/i18n/translations.ts
git commit -m "$(cat <<'EOF'
feat: show thumbnails and a manual picker on the Media page list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Audio gets the large full-screen view

**Files:**
- Create: `src/components/media/FullscreenMediaOverlay.tsx` (replaces `FullscreenVideoOverlay.tsx`)
- Delete: `src/components/media/FullscreenVideoOverlay.tsx`
- Modify: `src/components/media/MediaPlayerBar.tsx`
- Modify: `src/components/media/MediaPlayerHost.tsx`
- Modify: `src/pages/PlayerWindow/PlayerWindowPage.tsx`

**Interfaces:**
- Consumes: `buildMediaThumbnailUrl` (Task 4), `MediaPlaybackState` (existing, `useMediaPlayback.ts`).
- Produces: `FullscreenMediaOverlay` (same prop shape as the old `FullscreenVideoOverlay`, replaces it everywhere).

No automated test (no component test infrastructure exists). Manually verified at the end of this plan.

This task changes four files together because they only work as one atomic unit: `FullscreenMediaOverlay` must mount for audio too, `MediaPlayerBar` must stop rendering its own `<audio>` element (only one element may ever hold the real playback ref at a time), and `MediaPlayerHost`'s expand state must default to `false` instead of `true` — starting `true` was harmless before (only video ever mounted the overlay, and video's own auto-expand effect immediately reasserted `true` on the first render anyway), but now that the overlay mounts unconditionally, an unchanged `true` default would show fullscreen the instant an audio track starts playing, silently violating the "no auto-expand for audio" requirement.

- [ ] **Step 1: Create FullscreenMediaOverlay.tsx**

```tsx
// src/components/media/FullscreenMediaOverlay.tsx
import { useState } from 'react'
import { ListMusic, Minimize2, Music2, PictureInPicture2 } from 'lucide-react'
import { MediaTransportBar } from './MediaTransportBar'
import { MediaPlaylistPanel } from './MediaPlaylistPanel'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'
import type { MediaPlaybackState } from './useMediaPlayback'

interface FullscreenMediaOverlayProps {
  mediaRef: (el: HTMLVideoElement | HTMLAudioElement | null) => void
  playback: MediaPlaybackState
  visible: boolean
  onMinimize?: () => void
  onDetach?: () => void
}

// Always mounted whenever this window is hosting playback and isn't
// detached (see MediaPlayerHost) - covers both video and audio (see
// docs/superpowers/specs/2026-08-03-media-thumbnails-design.md section 6):
// video always fills this with a real <video>; audio renders a hidden
// <audio> (driving actual playback, non-visually) alongside its resolved
// thumbnail shown large, or a generic icon once that request 404s. `visible`
// only toggles CSS display, never whether the element itself is mounted, so
// minimizing back to the docked bar doesn't tear down and rebuffer anything
// - playback continues off-screen either way (display:none does not stop a
// <video>/<audio>'s decoding per the HTML spec).
export function FullscreenMediaOverlay({
  mediaRef,
  playback,
  visible,
  onMinimize,
  onDetach,
}: FullscreenMediaOverlayProps) {
  const { t } = useTranslation()
  const [showPlaylist, setShowPlaylist] = useState(false)
  // Tracked by path (not a plain boolean) so switching to a different track
  // - even one whose own thumbnail also happens to fail - doesn't keep
  // showing a stale failure from whatever track played before it, same
  // reasoning as GameThumbnail.tsx's own localFailedPath.
  const [thumbFailedPath, setThumbFailedPath] = useState<string | null>(null)
  const thumbFailed = thumbFailedPath === playback.track.path

  return (
    <div className={cn('fixed inset-0 z-50 flex-col bg-black', visible ? 'flex' : 'hidden')}>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {playback.isVideo ? (
          <video
            ref={mediaRef}
            {...playback.mediaElementProps}
            className="h-full w-full object-contain"
          />
        ) : (
          <>
            <audio ref={mediaRef} {...playback.mediaElementProps} />
            {thumbFailed ? (
              <Music2 className="h-32 w-32 text-white/30" />
            ) : (
              <img
                src={buildMediaThumbnailUrl(playback.track.path)}
                alt=""
                className="max-h-full max-w-full object-contain"
                draggable={false}
                onError={() => setThumbFailedPath(playback.track.path)}
              />
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-2 bg-black/80 p-3">
        <MediaTransportBar playback={playback} dark />
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => setShowPlaylist((v) => !v)}
            aria-label={t('media.playlist')}
            className={cn('text-white/70 hover:text-white', showPlaylist && 'text-white')}
          >
            <ListMusic className="h-4 w-4" />
          </button>
          {onDetach && (
            <button
              onClick={onDetach}
              aria-label={t('media.detachWindow')}
              className="text-white/70 hover:text-white"
            >
              <PictureInPicture2 className="h-4 w-4" />
            </button>
          )}
          {onMinimize && (
            <button
              onClick={onMinimize}
              aria-label={t('media.minimize')}
              className="text-white/70 hover:text-white"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {showPlaylist && <MediaPlaylistPanel dark className="max-h-40" />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete the old file**

```bash
rm src/components/media/FullscreenVideoOverlay.tsx
```

- [ ] **Step 3: Simplify MediaPlayerBar.tsx**

Replace `src/components/media/MediaPlayerBar.tsx` in full:

```tsx
import { useState } from 'react'
import { ListMusic, Maximize2, X } from 'lucide-react'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { MediaTransportBar } from './MediaTransportBar'
import { MediaPlaylistPanel } from './MediaPlaylistPanel'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'
import type { MediaPlaybackState } from './useMediaPlayback'

interface MediaPlayerBarProps {
  playback: MediaPlaybackState
  isDetached: boolean
  onExpandVideo?: () => void
}

// The slim, always-docked bar - used whenever the current track (video or
// audio) is minimized, or playback is running in the detached window
// instead. Never hosts the actual <video>/<audio> element itself - see
// FullscreenMediaOverlay, which stays mounted (just CSS-hidden) whenever
// this window isn't detached, for both video and audio, so minimizing back
// to this bar doesn't tear down and rebuffer anything.
export function MediaPlayerBar({ playback, isDetached, onExpandVideo }: MediaPlayerBarProps) {
  const { t } = useTranslation()
  const [showPlaylist, setShowPlaylist] = useState(false)
  const clearPlaylist = useMediaPlayerStore((s) => s.clearPlaylist)

  return (
    <div className="relative flex items-center gap-3 border-t border-border bg-card px-3 py-2">
      {isDetached && (
        <span className="shrink-0 rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
          {t('media.playingInOtherWindow')}
        </span>
      )}
      {!isDetached && onExpandVideo && (
        <button
          onClick={onExpandVideo}
          aria-label={t('media.expand')}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}

      <MediaTransportBar playback={playback} />

      <button
        onClick={() => setShowPlaylist((v) => !v)}
        aria-label={t('media.playlist')}
        className={cn(
          'shrink-0 text-muted-foreground hover:text-foreground',
          showPlaylist && 'text-foreground'
        )}
      >
        <ListMusic className="h-4 w-4" />
      </button>
      <button
        onClick={clearPlaylist}
        aria-label={t('media.closePlaylist')}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>

      {showPlaylist && (
        <div className="absolute bottom-full right-3 z-50 mb-1 max-h-64 w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
          <MediaPlaylistPanel />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Rewire MediaPlayerHost.tsx**

Replace `src/components/media/MediaPlayerHost.tsx` in full:

```tsx
import { useEffect, useState } from 'react'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useMediaPlayback } from './useMediaPlayback'
import { MediaPlayerBar } from './MediaPlayerBar'
import { FullscreenMediaOverlay } from './FullscreenMediaOverlay'

// Mounted once in AppLayout - renders nothing while the playlist is empty,
// so most of the app never even has this in the DOM. Playback survives
// page navigation because this lives above the router's <Outlet>.
//
// Owns the single useMediaPlayback instance for the main window: exactly
// one <video>/<audio> element exists here at a time, shared between the
// docked bar (when minimized) and FullscreenMediaOverlay (when expanded)
// purely via CSS visibility - see FullscreenMediaOverlay's own comment for
// why it's never unmounted just to minimize.
export function MediaPlayerHost() {
  const isDetached = useMediaPlayerStore((s) => s.isDetached)
  const setDetached = useMediaPlayerStore((s) => s.setDetached)
  const { mediaRef, playback } = useMediaPlayback({ isHost: !isDetached })

  // Starts minimized (false), not expanded - the auto-expand effect below
  // flips this true the first time a VIDEO track becomes current, but
  // never for audio (see FullscreenMediaOverlay's "no auto-expand for
  // audio" requirement). Starting this true (as it safely could before
  // FullscreenMediaOverlay covered audio too) would show fullscreen for an
  // audio track's very first play, before the effect below - which only
  // ever fires for isVideo tracks - gets any chance to run.
  const [mediaExpanded, setMediaExpanded] = useState(false)
  const [expandedForPath, setExpandedForPath] = useState<string | null>(null)

  // Auto-expands to fullscreen whenever a NEW video track becomes current -
  // adjusted during render (same pattern as useMediaPlayback's own
  // resetForPath), not in an effect, so there's no extra cascading render.
  // Deliberately video-only: skipping from an expanded video to an audio
  // track leaves mediaExpanded at whatever it already was (this block
  // simply doesn't run for audio), so an in-progress fullscreen viewing
  // session isn't interrupted - but nothing here ever sets it true FOR an
  // audio track on its own.
  if (playback && playback.isVideo && playback.track.path !== expandedForPath) {
    setExpandedForPath(playback.track.path)
    setMediaExpanded(true)
  }

  // Fires once the detached player window closes (by any means - the OS
  // close button included, see mediaWindowHandlers.ts) - hands playback
  // back to this window at wherever the other window last reported being.
  useEffect(() => {
    return window.api.media.onPlayerWindowClosed((seconds) => {
      setDetached(false, seconds)
    })
  }, [setDetached])

  if (!playback) return null

  const handleDetach = (): void => {
    const seconds = playback.currentTime
    setDetached(true, seconds)
    // Reads the store fresh (not the stale closure this render captured)
    // since setDetached above just changed it - the new player window's
    // own store starts empty otherwise (a separate renderer process, no
    // shared memory), so it needs this exact snapshot handed to it
    // directly rather than waiting for the next incidental broadcast.
    const state = useMediaPlayerStore.getState()
    window.api.media.openPlayerWindow({
      playlist: state.playlist,
      currentIndex: state.currentIndex,
      isPlaying: state.isPlaying,
      volume: state.volume,
      previousVolume: state.previousVolume,
      repeatMode: state.repeatMode,
      shuffleMode: state.shuffleMode,
      shuffleOrder: state.shuffleOrder,
      shufflePosition: state.shufflePosition,
      isDetached: true,
      handoffTimeSeconds: seconds,
    })
  }

  return (
    <>
      {!isDetached && (
        <FullscreenMediaOverlay
          mediaRef={mediaRef}
          playback={playback}
          visible={mediaExpanded}
          onMinimize={() => setMediaExpanded(false)}
          onDetach={handleDetach}
        />
      )}
      {(isDetached || !mediaExpanded) && (
        <MediaPlayerBar
          playback={playback}
          isDetached={isDetached}
          onExpandVideo={() => setMediaExpanded(true)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 5: Give the detached window's audio view the same real thumbnail**

Replace `src/pages/PlayerWindow/PlayerWindowPage.tsx` in full:

```tsx
import { useState } from 'react'
import { Music2 } from 'lucide-react'
import { useMediaPlayerSync } from '../../hooks/useMediaPlayerSync'
import { useMediaPlayback } from '../../components/media/useMediaPlayback'
import { MediaTransportBar } from '../../components/media/MediaTransportBar'
import { MediaPlaylistPanel } from '../../components/media/MediaPlaylistPanel'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import { useTranslation } from '../../i18n/useTranslation'

// The entire content of the detached player window (see
// electron/main/ipc/mediaWindowHandlers.ts, loaded at the #/player-window
// hash route in its own BrowserWindow) - no Sidebar/AppLayout, just the
// player. Always the playback host while mounted (this window only exists
// because the main window handed hosting off to it - see
// MediaPlayerHost.handleDetach) and reports its position back to the main
// process periodically so closing this window can hand a reasonably fresh
// seek position back to the main window. Its audio view shows the same
// resolved thumbnail as FullscreenMediaOverlay (falling back to the same
// generic icon) for visual consistency across both windows - this is its
// own separate useMediaPlayback instance in a separate renderer process, so
// it tracks its own thumbnail-failure state rather than sharing any with
// the main window's.
export function PlayerWindowPage() {
  const { t } = useTranslation()
  useMediaPlayerSync()
  const { mediaRef, playback } = useMediaPlayback({ isHost: true, reportTimeToMainProcess: true })
  const [thumbFailedPath, setThumbFailedPath] = useState<string | null>(null)

  if (!playback) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-sm text-white/60">
        {t('media.noTrackPlaying')}
      </div>
    )
  }

  const thumbFailed = thumbFailedPath === playback.track.path

  return (
    <div className="flex h-screen flex-col bg-black">
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {playback.isVideo ? (
          <video
            ref={mediaRef}
            {...playback.mediaElementProps}
            className="h-full w-full object-contain"
          />
        ) : (
          <>
            <audio ref={mediaRef} {...playback.mediaElementProps} />
            {thumbFailed ? (
              <div className="flex flex-col items-center gap-3 text-white/70">
                <Music2 className="h-16 w-16" />
                <p className="text-sm">{playback.track.name}</p>
              </div>
            ) : (
              <img
                src={buildMediaThumbnailUrl(playback.track.path)}
                alt=""
                className="max-h-full max-w-full object-contain"
                draggable={false}
                onError={() => setThumbFailedPath(playback.track.path)}
              />
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-2 bg-black/80 p-3">
        <MediaTransportBar playback={playback} dark />
        <MediaPlaylistPanel dark className="max-h-40" />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors, and no lingering references to `FullscreenVideoOverlay` anywhere (confirm with a search if either command reports one).

- [ ] **Step 7: Commit**

```bash
git add src/components/media/FullscreenMediaOverlay.tsx src/components/media/MediaPlayerBar.tsx src/components/media/MediaPlayerHost.tsx src/pages/PlayerWindow/PlayerWindowPage.tsx
git rm src/components/media/FullscreenVideoOverlay.tsx
git commit -m "$(cat <<'EOF'
feat: let audio playback use the large full-screen view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Game cover priority for code-linked entries

**Files:**
- Modify: `src/components/game/GameThumbnail.tsx`

No automated test (no component test infrastructure exists). Manually verified at the end of this plan. This task has no dependency on Tasks 1-7 and could run at any point in the sequence.

- [ ] **Step 1: Update useFallback and the file's own comment**

In `src/components/game/GameThumbnail.tsx`, replace the top comment block and the `useFallback` line:

```tsx
// Priority: a user-set custom cover (see DetailSidebar's "표지 이미지" section,
// mainly meant for code-less entries with no DLsite cover to crawl) always
// wins over everything else - it's an explicit choice. Below that, a
// code-linked entry (backlog item 10) always prefers the crawled DLsite
// cover over a local folder image - a random image sitting in the game's
// own folder is far less reliably "the cover" than the metadata this app
// already crawled specifically for that code. A code-less folder still
// prefers a cover-like image file inside itself (thumb:// protocol, see
// findThumbnailPath); only once that request 404s does it fall back to the
// DLsite cover (game_metadata.coverImagePath via useGameCoverImage) - lazy,
// so entries that already have a local cover (or don't need one, being
// code-linked) never trigger the fallback query at all.
// A file-kind entry (the common case - most games sit as their original
// .zip/.7z/.rar archive, never extracted into a folder) has nothing local to
// look inside for a cover - thumb:// only ever makes sense for a folder
// (findThumbnailPath does a real directory listing) - so it skips straight
// to the DLsite fallback instead of trying and failing a local lookup first.
// Renders nothing (letting the parent's own bg-muted placeholder show
// through) only once none of the three is available.
// Tracks the local failure by path rather than a plain boolean so a
// react-window row/cell recycled for a different entry doesn't keep showing
// a stale failure from whatever entry it last rendered.
export function GameThumbnail({ entry }: GameThumbnailProps) {
  const [localFailedPath, setLocalFailedPath] = useState<string | null>(null)
  const localFailed = localFailedPath === entry.path
  // Shares the same query cache entry as any other useGameUserData(entry)
  // call for this same card/row elsewhere in the tree - not an extra fetch
  // in practice.
  const { data: userData } = useGameUserData(entry)
  const hasCustomCover = !!userData?.customCoverPath
  const useFallback = entry.kind !== 'folder' || localFailed || !!entry.code
```

The rest of the file (the three hooks, the three render branches) is unchanged — `useFallback` already gates both which hooks fetch and which branch renders, so this one added condition is the entire change: a coded folder-kind entry now goes straight to the crawled-cover branch on a fresh render instead of attempting `thumb://` first, while a code-less entry's behavior is byte-for-byte identical to before (`!!entry.code` is `false` for it, so the boolean's value is unchanged).

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/game/GameThumbnail.tsx
git commit -m "$(cat <<'EOF'
fix: prefer crawled cover over local folder image for code-linked games

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Live Verification (controller-level, after all tasks and the final whole-branch review)

None of Tasks 5-8 have automated coverage for their user-facing behavior. After the final review passes, verify live via `npm run dev` (or the established Playwright `_electron` pattern from prior sub-projects this session) against real synthetic media:

1. Generate a short test video and an MP3 (ffmpeg is already on the dev machine — the exact commands used earlier this session: `ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -c:a libmp3lame -q:a 4 test.mp3` for audio; a short generated video via `ffmpeg -f lavfi -i testsrc=duration=3:size=320x240:rate=10 test.mp4` for video).
2. Point the Media page at a temp folder containing both, confirm: the video row shows a real extracted-frame thumbnail, the audio row shows either an embedded-art or directory-image thumbnail (or the default icon if neither exists for a synthetic file — expected, not a bug).
3. Click the row's thumbnail-picker button, choose an image, confirm the row's thumbnail updates without a page reload.
4. Play the audio track, confirm it does NOT auto-expand to fullscreen; click the docked bar's expand button, confirm the fullscreen view shows the same thumbnail large with a hidden `<audio>` still driving playback (transport bar controls keep working).
5. Play a video track, confirm it STILL auto-expands as before (no regression).
6. Detach playback to the separate window mid-audio-playback, confirm the detached window shows the same real thumbnail (not the old static music icon) — this is the one place this plan intentionally went slightly beyond the spec's literal file list (`PlayerWindowPage.tsx`), for consistency with the audio-thumbnail feature; call this out explicitly when reporting results.
7. Register a code-linked game whose own folder also contains an unrelated image file; confirm its Gallery/List card shows the crawled DLsite cover, not the local image.
8. Check the DevTools console for errors throughout.

Report back what was seen, and flag anything visually broken.
