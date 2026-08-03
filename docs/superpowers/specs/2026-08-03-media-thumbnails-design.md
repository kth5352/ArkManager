# Media Thumbnails — Design

## Goal

Give the Media tab's file list real thumbnails (a video keyframe, or an
audio file's embedded album art / a same-folder image), let audio playback
use the same large full-screen display video already has, and fix game
cover priority so a code-linked game's crawled cover wins over a random
image sitting in its own folder.

## Scope

Fifth sub-project of the v1.0.2 backlog (group "C" — items 5 and 10, plus
a detail raised mid-session during A's brainstorming and explicitly
deferred here: audio using the same large-thumbnail view as video). B, F,
and A are shipped. Touches: a new ffmpeg-based extraction module, a new
thumbnail-cache/override system for media files (parallel to the existing
game-cover-cache system, not shared storage), the Media page's list UI,
`FullscreenVideoOverlay`/`MediaPlayerBar`, and `GameThumbnail.tsx`'s
priority order. Not in scope: any other backlog item.

## Existing Precedent This Design Reuses Directly

Confirmed during brainstorming - this codebase already has almost every
building block this needs, just for game covers instead of media files:
- `electron/main/customCover/saveCustomCoverImage.ts` - takes a cache dir +
  a key + raw image bytes, hashes the key via `keyToSafeDirName`, converts
  to webp via `sharp` (already a dependency), writes to
  `{cacheDir}/{hashedKey}.webp`. The manual-override mechanism below is
  this function, called with a media-thumbnail-specific cache dir instead
  of the game-cover one - no new image-writing code needed.
- `electron/main/scanner/thumbnail.ts`'s `findThumbnailPath` - the
  same-folder-image fallback, reused as-is for audio's directory-image
  tier (video doesn't need it - see below).
- `electron/main/thumbnailProtocol.ts` - the `thumb://` custom protocol
  pattern (serves bytes via Chromium's own network stack, no IPC/base64
  round trip) - the new auto-extracted-thumbnail cache is served the same
  way, via a second custom protocol.
- No DB row is needed to track an auto-extracted cache file - same as
  `thumb://`'s own design, file-existence-on-disk is the source of truth
  (absent = not yet extracted or extraction failed either way, re-tried
  next request; present = done). Only the MANUAL override needs a DB row,
  to distinguish "user explicitly chose this" from "this happens to be
  what auto-extraction produced" - see §3.

## 1. ffmpeg Integration

`ffmpeg-static` added as a dependency (bundles a static binary per
platform - accepted installer-size increase, confirmed with the user).
Two new pure-ish extraction functions, following `readExeFileVersion.ts`'s
existing PowerShell-exec safety pattern from the save-snapshot plan
(quote/argument safety, timeout, resolve `null` on any failure rather than
throwing) but via `execFile` with an argument array (no shell string
concatenation at all needed here, unlike the PowerShell case - `execFile`
with an args array never invokes a shell, so there's no injection surface
to escape in the first place):

```ts
// electron/main/media/extractVideoFrame.ts
export async function extractVideoFrame(
  videoPath: string,
  outputPath: string
): Promise<boolean>
```
Runs `ffmpeg -y -ss 00:00:01 -i {videoPath} -frames:v 1 -q:v 2 {outputPath}`
(a fixed 1-second offset - avoids needing to probe duration first; a video
shorter than 1s falls through to ffmpeg's own end-of-stream handling,
which still emits a frame in practice, or fails cleanly if genuinely empty).
Returns `true` on a zero exit code, `false` on any error/non-zero exit
(caller treats `false` exactly like "no video frame available", falling
through to the default icon - video has no directory-image tier, since a
frame from the video itself is always the more relevant thumbnail when
it's available at all, and when it's not, a stray folder image next to a
video file is far less likely to be "this video's cover" than the
equivalent is for a music folder).

```ts
// electron/main/media/extractAudioArt.ts
export async function extractAudioArt(
  audioPath: string,
  outputPath: string
): Promise<boolean>
```
Runs `ffmpeg -y -i {audioPath} -an -vcodec copy {outputPath}` (extracts an
attached-picture stream if the file has one - ID3 APIC for MP3, similar
tags for FLAC/OGG/M4A - ffmpeg handles the format differences itself).
Returns `false` (not an error) when the file simply has no embedded art,
same signature/contract as `extractVideoFrame`.

## 2. Thumbnail Cache + Protocol

New cache directory `{userData}/media-thumbnails/`, populated lazily:

```ts
// electron/main/media/resolveMediaThumbnail.ts
export async function resolveMediaThumbnail(
  cacheDir: string,
  filePath: string,
  isVideo: boolean
): Promise<string | null>
```

Checks `{cacheDir}/{keyToSafeDirName(filePath)}.webp` first (already
extracted, most requests after the first hit this and skip straight to
returning the path). If absent: calls `extractVideoFrame`/`extractAudioArt`
into a temp file, converts through `sharp(...).webp().toFile(...)` into the
cache path (matching `saveCustomCoverImage`'s own conversion step, for
consistent format/size across every thumbnail source), deletes the temp
file, and returns the cache path. If extraction fails (or, for audio, the
file has no embedded art): for audio, falls through to
`findThumbnailPath` on the file's containing directory (reused as-is,
already handles "no image found" by returning `null`); for video, returns
`null` directly (see §1's video/no-directory-tier reasoning). `null`
either way means "nothing to show here, fall back to the default icon" -
that fallback is the renderer's job, not this function's (this function
just answers "does a real thumbnail exist for this file", not "what
placeholder to draw instead").

New custom protocol `mediathumb://`, registered/handled the same way
`thumbnailProtocol.ts` already is (privileged scheme, path-safety check
against registered libraries - reused, since media files a user points the
Media page at could be outside any registered library, so this protocol's
safety check is instead "is this path currently reachable from the
persisted media folder setting", not library-scoped): the frontend requests
`mediathumb://thumbnail/{encodeURIComponent(filePath)}`, the handler calls
`resolveMediaThumbnail` and serves the resulting file's bytes (404 if
`null`).

## 3. Manual Override

New table, following `game_user_data`'s established DDL/repository
conventions (hand-written `CREATE TABLE IF NOT EXISTS` in `client.ts`, no
drizzle-kit migrations - same precedent the save-snapshot plan already
used for its own new table):

```sql
CREATE TABLE IF NOT EXISTS media_thumbnail_overrides (
  key TEXT PRIMARY KEY,
  thumbnail_path TEXT NOT NULL
)
```

`key` is the media file's own absolute path (not hashed - hashing only
happens at the filesystem-path level via `keyToSafeDirName`, same as every
other place this codebase keys a cache file by an arbitrary path). Repository
functions `getMediaThumbnailOverride`/`setMediaThumbnailOverride` mirror
`pathCodeOverridesRepository.ts`'s exact shape (single-column key lookup,
`onConflictDoUpdate` upsert).

Setting one: a new IPC handler takes `{filePath, imageBuffer}` (already-read
bytes, from a native file picker - mirrors `SET_CUSTOM_COVER_FROM_FILE`'s
existing contract exactly), calls `saveCustomCoverImage` with a
manual-override-specific cache dir (`{userData}/media-thumbnail-overrides/`,
separate from the auto-extraction cache dir in §2 - keeping "user chose
this" and "auto-extraction produced this" in physically separate
directories means clearing one cache can never accidentally destroy the
other), then upserts the DB row with the resulting path.

## 4. Resolution Priority (both video and audio)

A new `useMediaThumbnail(filePath, isVideo)` hook (mirrors
`GameThumbnail.tsx`'s existing three-tier hook-based priority exactly):
1. `media_thumbnail_overrides` row for this path, if any (manual - highest
   priority, an explicit choice always wins, same rule as game custom
   covers).
2. `mediathumb://` protocol request (§2's auto-extraction chain: keyframe/
   embedded-art, then audio's directory-image fallback within that same
   request - the renderer only ever makes one request and gets back
   "here's an image" or a 404, it doesn't need to know which tier inside
   §2 actually produced it).
3. Neither resolved: render a default icon (a generic video/music glyph,
   distinguished by `isVideo` - matches the Media page's current bare
   `Play` icon placeholder, just kept as the final fallback instead of the
   only option).

## 5. Media Page List Thumbnails

`MediaPage.tsx`'s list rows gain a small thumbnail (reusing the same
`h-10 w-10 rounded` treatment `SaveEntryRow` already uses for game covers
in the Saves page, for visual consistency across the app's various list
rows) to the left of the existing Play icon/track name, using
`useMediaThumbnail`.

## 6. Audio Gets the Large Full-Screen View (Manual Expand Only)

`FullscreenVideoOverlay.tsx` is generalized (renamed conceptually to cover
both, though the exact file/rename is a plan-time decision) to also render
for audio tracks: swaps the `<video ref={mediaRef}>` for a large `<img>`
using the same `useMediaThumbnail` result (falling back to a large default
icon/glyph if neither tier resolves) displayed `object-contain` in the same
layout, while a hidden `<audio ref={mediaRef}>` stays mounted alongside it
for actual playback (mirrors `MediaPlayerBar`'s own existing pattern of a
non-visually-rendered `<audio>` element driving playback under other
visible UI).

**No auto-expand for audio** (explicit user decision, confirmed during
brainstorming) - `MediaPlayerHost.tsx`'s existing auto-expand-on-new-video
logic stays video-only. Instead, `MediaPlayerBar.tsx` gains an expand
button for audio tracks too, mirroring the existing `onExpandVideo` prop/
`Maximize2` button exactly (currently gated `playback.isVideo &&
!isDetached && onExpandVideo` - the video-only condition is dropped, video
and audio both get the same expand affordance from the docked bar).

## 7. Game Cover Priority for Code-Linked Entries (item 10)

`GameThumbnail.tsx`'s current order is: custom cover → local folder image
(`thumb://`, folder-kind only) → crawled DLsite cover (fallback, only tried
after local 404s or immediately for file-kind entries). For an entry with
`entry.code` set (code-linked), swap the middle two: try the crawled cover
(`useGameCoverImage`) before the local folder image, keeping custom cover
as the unconditional top priority for every entry (coded or not) and
keeping the existing order (`thumb://` first) unchanged for entries with no
code at all, since those have no crawled cover to prefer in the first
place. Concretely: the `useFallback` boolean (currently `entry.kind !==
'folder' || localFailed`) gains a third condition, `|| !!entry.code`, so a
coded folder-kind entry goes straight to the crawled-cover path instead of
attempting `thumb://` first; an existing successful `thumb://` load for a
coded entry is not retroactively replaced (this only changes ordering for
a fresh render, not a running one), and `localFailed`'s existing role
(falling back to crawled cover once `thumb://` genuinely 404s) is
unaffected for non-coded entries.

## Testing

`extractVideoFrame`/`extractAudioArt` mirror `readExeFileVersion.ts`'s own
precedent (no test file - shelling out to a real binary against real media
isn't something a unit test can usefully cover without either a slow
integration test or a mock that only proves itself was called) -
`resolveMediaThumbnail`'s tiered fallback logic, being pure control flow
around those two functions plus `findThumbnailPath`, gets a real test via
dependency injection (mirrors `detectGameVersion.test.ts`'s own DI pattern
from the save-snapshot plan: inject fake `extractVideoFrame`/
`extractAudioArt` functions, use real temp directories for the
filesystem-touching parts). `GameThumbnail.tsx`'s priority reorder has no
component test infrastructure to extend (none exists anywhere in this
codebase) - verified via `npm run dev` like every other UI change this
session. The Media page thumbnails, the fullscreen audio view, and the
manual-override picker are all manual-verification-only for the same
reason.
