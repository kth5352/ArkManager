# Media Cover, UI Warning, Zoom, and Legacy VNDB Cleanup Design

## Goal

Fix four reported regressions without broadening the media or metadata model:

- WAV thumbnail selection must not attempt an impossible FFmpeg attached-picture write.
- Recovery backups must not remain after the original audio has been restored and verified.
- dialog trees must not emit duplicate React child keys.
- `Ctrl++` must zoom in across common keyboard layouts.
- stale metadata created by the old ambiguous `v<digits>` filename recognizer must not survive as visible or reusable cache unless user-owned state references it.

## Chosen Approach

Use a narrow compatibility fix. WAV remains byte-for-byte unchanged and uses Ark Manager's existing app-local media-thumbnail override. MP3, FLAC, and M4A retain embedded cover writes. UI and shortcut fixes stay within their current ownership boundaries. The existing VNDB migration is refined instead of adding a second migration layer.

Rejected alternatives:

- RIFF/WAVE ID3 APIC writing: some players support it, but stock Windows Explorer does not reliably expose WAV tags or cover art. It cannot satisfy the requested compatibility guarantee.
- automatic WAV-to-FLAC conversion: it would create a second media file and alter the user's library workflow. The user selected WAV preservation with an Ark Manager-local cover.

## WAV and Audio Backup Behavior

`.wav` is removed from the embedded-cover support set. Selecting a cover for WAV skips FFmpeg, does not create a work file, does not create an audio backup, saves the selected image through the existing media-thumbnail override cache, and returns a normal `override` result rather than an embedding-failure warning.

Ark Manager already resolves manual media-thumbnail overrides before embedded art and automatic extraction. Therefore the selected WAV cover is visible in Media views even though the WAV bytes remain unchanged.

MP3, FLAC, and M4A keep this sequence:

1. create an exclusive backup next to the source;
2. write an isolated work file;
3. validate audio stream, duration, and cover on the candidate;
4. replace the source;
5. validate the replaced source against the backup;
6. delete the backup only after success.

On any failure after backup creation, restore the source from the backup. After restoration, compare SHA-256 hashes of source and backup. Delete that operation's backup only when the hashes match exactly. If restoration fails, hashing fails, or hashes differ, retain the backup and surface a concise recovery warning. Work-file cleanup remains best effort. The UI must not expose the complete FFmpeg command or stderr in a toast; detailed diagnostics stay in the main-process log.

No startup or recursive cleanup scans arbitrary library folders for old backup names. Only the backup created by the current operation is eligible for automatic removal. The reported target directory currently contains no retained `.ark-cover-backup-*` file.

## Dialog Key Consistency

Introduce one pure dialog-key helper that combines dialog kind and active identity, for example `rename:closed`, `launch:D:\\Games\\Title`, and `rating:VNV17`. Closed keys are unique across sibling dialogs by construction.

Apply it to all multi-dialog sibling groups that currently reuse the literal `closed`, including `DetailSidebar` and `DetailOverlay`. Existing sites that already use unique prefixed fallback keys remain unchanged unless adopting the helper removes duplication without changing behavior.

The helper receives only strings and has no React dependency. Unit tests prove that different dialog kinds never produce the same closed key and that active identities remain stable.

## Zoom-In Shortcut

Keep Electron's application menu and existing zoom-out/reset roles. Add a reusable `before-input-event` handler to each application BrowserWindow so the following key-down inputs invoke one zoom-in step:

- `Ctrl+=`;
- `Ctrl+Shift+=`, which produces `+` on common keyboards;
- Numpad `+`;
- the corresponding Command combinations on macOS.

The handler ignores Alt combinations and key-up events, calls `preventDefault()` for recognized inputs to avoid double execution, and increases the focused window's zoom level by one native-sized half-level step. It does not alter Gallery/Explorer `Ctrl+wheel` card-size zoom.

Shortcut recognition is isolated as a pure function and unit-tested against `Equal`, `+`, `NumpadAdd`, minus, Alt, missing modifier, and key-up cases.

## Legacy VNDB Cache Cleanup

The canonical filename recognizer continues to accept only `VNV<digits>` and `VNR<digits>`. Bare `v<digits>`, `r<digits>`, legacy `VN<digits>`/`VR<digits>`, and version-like filenames remain rejected.

Before mutating legacy database rows, the VNDB migration collects exact `VN<digits>` and `VR<digits>` keys referenced by user-owned state:

- `game_user_data` rows whose `key_type` is `code`;
- `path_code_overrides.code`;
- `save_snapshot_labels.key`.

For `game_metadata` and `metadata_failures`:

- referenced legacy keys follow the existing conflict-preserving migration to `VNV`/`VNR`;
- unreferenced legacy rows are deleted because they are recreatable caches and cannot be associated by the new scanner.

User-owned rows and path overrides continue to migrate non-destructively under the existing transaction. Canonical destination conflicts retain both rows rather than deleting user data. Save-directory migration behavior is unchanged.

For the current read-only user database inspection, `VN13774` and `VN751` are referenced by manual path overrides and will be preserved as `VNV13774` and `VNV751`. Cache-only entries such as `VN1`, `VN2`, `VN3`, `VN8`, and `VN912` will be removed. No `game_user_data` or snapshot-label legacy rows currently exist.

The application must be fully restarted for main-process scanner and database migration changes to take effect. A renderer-only reload is not sufficient.

## Error Handling

- WAV override writes fail only if the image-cache or database override write fails; no embedding warning is generated.
- Embedded-format restore failures remain fatal because source integrity cannot be guaranteed.
- A retained recovery backup is explicitly reported without dumping the child-process command.
- Database cache cleanup and identity migration run in the same transaction, so partial cleanup cannot commit.
- Zoom handling checks destroyed web contents before reading or setting zoom.

## Verification

Tests will cover:

- WAV reports unsupported embedding and never calls backup/FFmpeg dependencies;
- WAV handler stores and returns an app-local override;
- embedded-format failure restores, hash-verifies, and deletes a redundant backup;
- restore/hash mismatch retains the recovery backup;
- warning text is concise;
- dialog closed keys are unique;
- all zoom-in keyboard variants and negative cases;
- unreferenced `VN1`/`VN912` cache deletion;
- preservation and migration of referenced `VN13774`/`VN751` data;
- existing canonical conflicts and idempotency;
- the `Game_v912.exe` scanner regression remains green.

Project-wide typecheck, lint, full tests, the read-only `D:\\ark\\ehddls` scan, and the Windows `1.1.0` build run before completion. The packaged application is not launched during verification, so the actual user database is not modified by tests.
