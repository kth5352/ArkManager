# Backlog Integration Design

## Goal

Resolve the deferred usability and correctness backlog as a set of focused,
testable changes without replacing the app's existing Electron/React/TanStack
Query architecture. The work covers media cover writing and lyrics, metadata
fallback lookup for region-locked DLsite works, VNDB ID correctness, favorites
deduplication, search UI consistency, tray minimize behavior, batch rename
selection cleanup, and a set of Explorer polish fixes.

## Scope

This spec covers the user's August 8 backlog. It intentionally keeps the
implementation inside existing boundaries:

- Electron main process owns filesystem mutation, metadata crawling, tray
  behavior, and media file validation.
- Renderer owns UI state, search controls, player subtitle display, and query
  invalidation.
- Shared types remain the source of truth for IPC payloads and game code
  shapes.
- Vitest covers pure logic, database repositories, metadata mapping, IPC schema
  compatibility, and filesystem-operation control flow.

Not in scope:

- Replacing the UI framework or theme system.
- A full component-test harness.
- Automatic metadata retry loops after failures.
- Shipping a hardcoded third-party mirror that always receives user queries.

## 1. Audio Cover Art Writes

The current media thumbnail override is an app-local display override: it copies
an image into `userData/cache/media-thumbnail-overrides` and stores a
`filePath -> thumbnailPath` row. That is not enough for the requested behavior.
For supported audio files, choosing a thumbnail should write cover art into the
media file itself.

Supported formats:

- `mp3`
- `flac`
- `m4a`
- `wav`

Other formats keep the existing app-local override behavior or show an
unsupported-format message. WAV support is best-effort because cover art is not
as consistently supported across players as ID3/FLAC/MP4 tagging.

Write flow:

1. Copy the original file to a temporary backup path.
2. Write the cover art to a temporary work file or atomically rewrite the target
   through the selected tagging tool.
3. Validate the modified result with ffprobe-like checks:
   - file opens successfully,
   - at least one audio stream exists,
   - duration is present and close to the original duration,
   - the expected cover/art stream or tag is present when the format exposes it
     reliably.
4. Replace the original with the validated modified file.
5. Validate the final original path again.
6. Delete the backup on success.
7. If any step fails, restore the backup and show a failure toast/dialog.

Implementation should avoid shell-string command construction. Use `execFile`
with argument arrays if an external tool is required. The current project already
has `ffmpeg-static`; if a new tag-writing dependency is needed, it must be
format-specific, actively maintained, and covered by unit tests around our
adapter logic.

The old app-local media thumbnail override table remains useful for unsupported
formats and for fallback display while a file write fails.

## 2. LRC Lyrics/Subtitles

If a `.lrc` file exists next to a playable media file, the player should be able
to display it. Matching is by same directory and same basename:

- `Song.mp3`
- `Song.lrc`

Behavior:

- Lyrics are detected when a track starts or when its source changes.
- A new subtitles/lyrics toggle appears in the media player controls.
- Toggle defaults to on when lyrics exist and off when they do not.
- Synchronized LRC lines with `[mm:ss.xx]` style timestamps display according to
  current playback time.
- Lines without timestamps are treated as static lyrics text and can be shown in
  a scrollable panel/list.
- Malformed LRC should fail gracefully: no crash, a muted "lyrics unavailable"
  state if needed.

Main process should expose a safe IPC read that only returns `.lrc` files
located next to media paths that the existing media protocol would already allow.
The renderer should not get arbitrary filesystem read access.

## 3. Metadata Refresh Fallback Chain

This applies to the game detail "Refresh Metadata" action, not Electron's window
reload. Automatic retry loops are explicitly out of scope.

Refresh chain:

1. Try the current official DLsite HTML page crawl.
2. If it fails or parses to null, try DLsite JSON/API fallback endpoints.
3. If those fail, try configured external mirror/API providers.
4. If everything fails, store a failure state and show the failure in UI.

Failure state should store:

- `code`
- attempted sources, for example `dlsite-html`, `dlsite-json`, `external`
- reason: `not_found`, `blocked`, `network`, `parse`, `provider_error`
- `updated_at`

The next manual "Refresh Metadata" ignores the previous failure and starts the
same chain from step 1.

External providers:

- Disabled unless the user configures them in Settings.
- May include endpoint URL and API key/token.
- Must have a narrow response adapter that maps to `CrawledGameMetadata`.
- Must not receive requests unless enabled.
- Failures must not block local app usage.

DLsite JSON/API fallback should be implemented before external providers. Known
examples in the ecosystem include `product.json?workno=...` and
`product/info/ajax?product_id=...`, but these are not documented public APIs and
must be treated as unstable.

## 4. VNDB `v...` and `r...` ID Separation

The current VNDB path maps the app's `VN17` convention to VNDB `v17` and always
queries `/vn`. That causes `r45775`-style release IDs to collide conceptually
with `v45775`.

New internal convention:

- `VN45775` means VNDB visual novel ID `v45775` and queries `/vn`.
- `VR45775` means VNDB release ID `r45775` and queries `/release`.

Input/file recognition:

- `v45775` and `VN45775` normalize to `{ type: 'VN', value: 'VN45775' }`.
- `r45775` and `VR45775` normalize to `{ type: 'VR', value: 'VR45775' }`.
- Existing `VN...` values remain compatible.

DB identity:

- Metadata rows remain keyed by `code.value`.
- `VN45775` and `VR45775` are different keys.
- User data keyed by code follows the same separation.

Release mapping:

- `/release` responses should map title, release date, producer/developer data,
  tags/genres where available, and cover image. If a release field is absent,
  fall back to linked VN data only when explicitly requested by the API response
  fields and without changing the `VR...` identity.

This matches VNDB's official Kana API model, which documents `/vn` and
`/release` as distinct query endpoints.

## 5. Favorites Page Deduplication

The favorites page should show favorite games, not every file copy belonging to
the same favorited game.

Current issue:

- `filterFavorites(games, favoriteKeys)` returns every scanned entry whose
  code/path matches a favorite key.
- Multiple files/folders sharing one code all render as separate cards.

New behavior:

- Group favorite coded entries by `code.value`.
- Keep one representative per code.
- Code-less favorites remain path-based and are not grouped unless their paths
  are identical after normalization.

Representative selection:

1. Prefer folders over files.
2. Prefer non-archive entries over archive files.
3. Prefer latest `mtimeMs`.
4. Tie-break by normalized path for deterministic output.

The grouped list should preserve stable sorting so cards do not jump around
between renders.

## 6. Search Header Layout

The search button's expandable area should contain both:

- text query input,
- tag/genre filter input.

The standalone tag field outside the expanded search control should be removed.
When collapsed, both inputs collapse together. Active include/exclude chips and
clear filters may remain outside the collapsed width as visible state.

Keyboard behavior:

- `Ctrl+F` expands the control and focuses the text query input.
- Pressing Enter in the tag field keeps the existing include/exclude behavior:
  `tag` includes, `-tag` excludes.
- Blur should not collapse while focus moves between the text input and tag
  input inside the same expanded group.

## 7. Tray Minimize on Close

Closing the main window should minimize the app to the system tray instead of
quitting.

Behavior:

- First main-window close hides the window and keeps the app running.
- Tray icon uses `LOGO.png`.
- Tray menu includes:
  - Open,
  - Exit.
- Double-clicking the tray icon opens/restores the main window.
- Explicit Exit sets an `isQuitting` flag, closes media/player windows, flushes
  active play sessions, and quits.
- `second-instance` should restore/focus the existing hidden/minimized window.

Detached player window handling:

- Closing the main window to tray must not kill media playback.
- Explicit Exit should close the detached player window and quit.

## 8. Batch Rename Selection Cleanup

After a successful batch rename, selection mode should be deactivated. If there
are failures, the result list still appears, but the selection mode should not
remain active behind the dialog.

The likely implementation point is the rename success callback used by
`SelectionToolbar`/`RenameDialog`, not the filesystem rename function itself.

## 9. App-Level File Refresh Without Media Interruption

The app needs a file-list refresh action that does not reload the renderer and
does not interrupt media playback. This is separate from Electron's development
reload menu item.

Behavior:

- Refresh invalidates scan-related React Query keys only:
  - `games`,
  - `folder-scan`,
  - `folder-scan-recursive`.
- It does not reset `mediaPlayerStore`.
- It does not remount the app root.
- It can be exposed from existing page toolbar/menu locations where refresh is
  meaningful.

Metadata refresh remains separate and uses the chain in section 3.

## 10. UI Consistency Pass

This is a consolidation pass, not a redesign.

Rules:

- Keep shadcn/Radix/Tailwind tokens.
- Standardize icon button sizes in toolbars.
- Standardize toast style and placement through one wrapper/helper around
  Sonner, instead of hand-written variants spread across pages.
- Keep cards at 8px radius or less.
- Use existing `Button`, `Input`, `Dialog`, `Select`, `Slider`, and
  `HoverTooltip` primitives before adding new primitives.
- Align list rows around fixed icon/thumbnail columns.
- Keep dense app surfaces dense; no landing-page or hero-style layout.

Targets:

- Toasts from file ops, launch config, metadata refresh, media cover writes.
- Toolbars in Gallery/List/DetailList/Explorer/Media.
- Dialog spacing and action placement for rename/move/delete/settings-style
  dialogs.
- Media controls and playlist panel affordances.

The pass should not rewrite every component. It should introduce small shared
helpers/classes where duplication is already causing inconsistent behavior.

## 11. Explorer Visual Policy Fixes

The Explorer backlog is implemented as local fixes, not a second Explorer
rewrite.

Items:

1. Fix uneven icon alignment by giving rows/cards fixed icon slots and matching
   `SelectionCheckbox` dimensions.
2. Remove dead `exit={{ width: 0 }}` animation props where no longer used.
3. Make TabBar's `+` and open-folder buttons participate in layout animation
   when tabs are added/removed.
4. Add crossfade when switching between normal list/grid content and search
   results.
5. Add limited keyboard move support for focused/selected rows. Full keyboard
   drag-and-drop parity is out of scope. A practical shortcut-based move UI is
   acceptable.

## 12. Explorer Drag-and-Drop Path Fixes

Items:

1. Move `getParentPath` out of `groupMovesByOriginalParent.ts` into a path utility
   module because it is now public Explorer behavior, not undo grouping only.
2. Fix UNC paths without a share segment defensively.
3. Make drive-root and UNC-root return shapes consistent.
4. Dropping onto a tab outside a registered library should show a toast instead
   of silently ignoring the drop.

The existing backend move safety stays unchanged. Renderer feedback should not
weaken main-process path validation.

## 13. Explorer Grid Fixes

Items:

1. Grid selection mode must not push content down by about 26px. Toolbar/control
   height should be stable across selection inactive/active states.
2. In grid + search mode, zoom slider should either be hidden or enabled only
   when it affects the visible grid. Since search results are list-like, hide
   zoom while searching.

## 14. Explorer Sidebar Fixes

Items:

1. Fix `pathToBreadcrumbSegments` UNC handling, including `\\server\share` roots.
2. Avoid the sidebar open-state flash before the persisted setting loads.
3. Avoid recreating `Set` state unnecessarily when active path changes but no
   ancestor expansion actually changes.

The sidebar should keep the recent active-drive-root behavior and namespaced
tree droppable IDs.

## Testing Strategy

Automated tests:

- Audio cover write adapter:
  - successful backup/write/validate/delete flow,
  - failed validation restores backup,
  - unsupported format path,
  - WAV branch marks best-effort/limited support.
- LRC parsing:
  - synced timestamps,
  - multiple timestamps on one line if supported,
  - static lyrics without timestamps,
  - malformed lines.
- Metadata fallback chain:
  - HTML success stops chain,
  - HTML null then JSON success,
  - JSON failure then external provider success,
  - all fail stores failure state,
  - manual refresh ignores previous failure state.
- VNDB:
  - parse `v45775` as `VN45775`,
  - parse `r45775` as `VR45775`,
  - `VN` uses `/vn`,
  - `VR` uses `/release`,
  - search results preserve correct prefix.
- Favorites:
  - coded duplicates collapse to one representative,
  - folder beats file,
  - latest mtime wins after kind priority,
  - code-less favorites remain path-specific.
- Explorer pure utilities:
  - UNC breadcrumb segments,
  - drive root parent,
  - UNC root parent,
  - malformed UNC defensive behavior.
- Selection cleanup:
  - rename success deactivates selection store.

Manual verification:

- Actual cover art write on sample mp3/flac/m4a/wav files.
- Media playback survives file-list refresh and tray hide/show.
- `.lrc` display tracks playback time.
- Tray open/exit behavior in dev and packaged build if possible.
- UI consistency pass in light/dark themes.
- Explorer drag/drop feedback and tab/sidebar animations.

## Risks and Mitigations

- Audio file mutation can corrupt originals if interrupted. Mitigation: backup,
  validation, restore-on-failure, and no shell-string commands.
- WAV cover art compatibility is inconsistent. Mitigation: mark support as
  best-effort and validate the file remains playable even if cover detection is
  weaker.
- DLsite JSON endpoints are undocumented and may change. Mitigation: fallback
  only, typed adapters, graceful failure state.
- External providers may leak lookup activity. Mitigation: disabled unless user
  configures them.
- VNDB ID migration could break existing `VN...` metadata. Mitigation: keep
  existing `VN...` semantics for visual novel IDs and only add `VR...`.
- Tray minimize can confuse explicit quit behavior. Mitigation: `isQuitting`
  flag and clear menu labels.

## References

- VNDB Kana API: `https://api.vndb.org/kana`
- DLsite JSON endpoint examples from existing userscripts/docs:
  - `https://sleazyfork.org/be/scripts/451795-dlsite-rj-code-preview/code`
  - `https://gist.github.com/Negima1072/7b5c7c8e4175ebccea94e12e65ff3302`
  - `https://kone.gg/s/somisoft/bdwz7AIzHYPR137TpgJ5Wb?c=2026-01-23T14%3A53%3A27.000Z&oh=imya`
