# VNDB Code Prefix Design

## Goal

Prevent ordinary version strings such as `Game_v912.exe`, `Title v1.0`, and
`v8_context_snapshot.bin` from being recognized as VNDB identifiers and
causing a game folder's internal resources to appear as separate library
entries.

## Code Convention

- `VNV45775` represents VNDB visual novel ID `v45775`.
- `VNR45775` represents VNDB release ID `r45775`.
- Filename scanning recognizes only the explicit `VNV` and `VNR` forms.
- Bare `v45775` and `r45775` are not recognized inside filenames.
- The game-search input continues accepting an entire input of `v45775` or
  `r45775` and normalizes it to `VNV45775` or `VNR45775` respectively.

The existing `RJ`, `VJ`, `ST`, and `GC` conventions remain unchanged.

## Existing Data

Existing VNDB values stored as `VN<digits>` and `VR<digits>` must be migrated
to `VNV<digits>` and `VNR<digits>` wherever they are persisted as identities:

- game metadata and metadata failures,
- game user data,
- path-to-code overrides,
- code-based save keys and snapshot labels,
- code-named save snapshot directories under the app's user-data folder.

The database portion runs in one transaction. It copies a legacy row only when
the canonical target key does not already exist; if both keys exist, the
canonical row wins and the legacy row is retained rather than overwritten or
deleted. Save snapshot directories use the same no-overwrite rule. This makes
the migration idempotent and preserves ratings, memos, favorite/cleared state,
launch and save configuration, playtime, custom covers, cached metadata, and
snapshots. Existing cover files do not need renaming because their absolute
paths remain valid after the metadata key changes.

Code parsing must match full prefixes instead of deriving a type from the first
two characters. This applies especially to path-code overrides and VNDB URL/API
mapping, where `VNV` and `VNR` have three-character prefixes.

## Scanner Behavior

Filename recognition accepts explicit values such as:

- `[VNV45775] Game`
- `VNR45775_release.zip`
- `Game_VNV17`

It rejects ambiguous values such as:

- `Game_v912.exe`
- `Title v1.0.4`
- `v8_context_snapshot.bin`
- `model_v2.index`

With the false code signal removed, a code-less folder containing direct game
files is classified as one game root by the existing recursive scanner. For
the reported path, the library result should contain `アームズブレス` and not
its `bgm`, `bmp`, `data`, `user_data`, or `wave` resource folders.

## External Mapping

- `VNV45775` opens and queries VNDB as `v45775` using the `/vn` endpoint.
- `VNR45775` opens and queries VNDB as `r45775` using the `/release` endpoint.
- Filters, duplicate grouping, metadata lookup, and search-result navigation
  preserve the full three-letter internal prefix.

## Testing

- Scanner code-recognition tests cover accepted `VNV`/`VNR` forms and reject
  common version-string false positives.
- Search-input tests verify bare `v`/`r` normalization and explicit
  `VNV`/`VNR` input.
- Recursive scanner regression coverage reproduces the `Game_v912.exe` game
  root and verifies that internal folders are not exposed.
- VNDB API, external URL, IPC schema, filtering, and metadata identity tests
  use the new prefixes.
- Database migration tests verify data preservation and idempotency.
