import { z } from 'zod'

export const IPC_CHANNELS = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_SYNC: 'settings:get-sync',
  LIBRARIES_LIST: 'libraries:list',
  LIBRARIES_ADD: 'libraries:add',
  LIBRARIES_REMOVE: 'libraries:remove',
  LIBRARIES_PICK_FOLDER: 'libraries:pick-folder',
  SCANNER_SCAN_RECURSIVE: 'scanner:scan-recursive',
  SCANNER_SCAN_SHALLOW: 'scanner:scan-shallow',
  // Push-only, main -> renderer: fired periodically while a
  // SCANNER_SCAN_RECURSIVE request is in flight (see scannerHandlers.ts) so
  // a long scan can show live progress instead of an indefinite spinner. No
  // request/response schema - not invoked via ipcRenderer.invoke.
  SCANNER_SCAN_PROGRESS: 'scanner:scan-progress',
  EXPLORER_SAVE_TABS: 'explorer:save-tabs',
  EXPLORER_LOAD_TABS: 'explorer:load-tabs',
  EXPLORER_RENAME_ENTRIES: 'explorer:rename-entries',
  EXPLORER_DELETE_ENTRIES: 'explorer:delete-entries',
  EXPLORER_PICK_MOVE_DESTINATION: 'explorer:pick-move-destination',
  EXPLORER_MOVE_ENTRIES: 'explorer:move-entries',
  SORT_GET: 'sort:get',
  SORT_SET: 'sort:set',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  SHELL_SHOW_ITEM_IN_FOLDER: 'shell:show-item-in-folder',
  SHELL_OPEN_PATH: 'shell:open-path',
  METADATA_CRAWL_AND_SAVE: 'metadata:crawl-and-save',
  METADATA_GET: 'metadata:get',
  METADATA_GET_FAILURE: 'metadata:get-failure',
  METADATA_GET_MANY: 'metadata:get-many',
  METADATA_GET_COVER_IMAGE: 'metadata:get-cover-image',
  METADATA_SEARCH: 'metadata:search',
  // Enqueues codes with no game_metadata row yet for background crawling,
  // one at a time with a delay between requests (see bulkCrawlQueue.ts) -
  // fire-and-forget, resolves once the codes are queued, not once crawled.
  METADATA_CRAWL_MISSING: 'metadata:crawl-missing',
  // Push-only, main -> renderer: fired after each queued code finishes
  // crawling (success or failure). No request/response schema.
  METADATA_BULK_CRAWL_PROGRESS: 'metadata:bulk-crawl-progress',
  GAME_USER_DATA_GET: 'game-user-data:get',
  GAME_USER_DATA_SET_FAVORITE: 'game-user-data:set-favorite',
  GAME_USER_DATA_SET_CLEARED: 'game-user-data:set-cleared',
  GAME_USER_DATA_SET_RATING_AND_MEMO: 'game-user-data:set-rating-and-memo',
  GAME_USER_DATA_LIST_FAVORITE_KEYS: 'game-user-data:list-favorite-keys',
  GAME_USER_DATA_LIST_RECENTLY_PLAYED: 'game-user-data:list-recently-played',
  GAME_USER_DATA_LINK_CODE: 'game-user-data:link-code',
  GAME_USER_DATA_UNLINK_CODE: 'game-user-data:unlink-code',
  GAME_USER_DATA_PICK_CUSTOM_COVER_FILE: 'game-user-data:pick-custom-cover-file',
  GAME_USER_DATA_SET_CUSTOM_COVER_FROM_FILE: 'game-user-data:set-custom-cover-from-file',
  GAME_USER_DATA_SET_CUSTOM_COVER_FROM_CLIPBOARD: 'game-user-data:set-custom-cover-from-clipboard',
  GAME_USER_DATA_CLEAR_CUSTOM_COVER: 'game-user-data:clear-custom-cover',
  GAME_USER_DATA_GET_CUSTOM_COVER_IMAGE: 'game-user-data:get-custom-cover-image',
  LAUNCH_LIST_EXECUTABLES: 'launch:list-executables',
  LAUNCH_IS_LOCALE_EMULATOR_AVAILABLE: 'launch:is-locale-emulator-available',
  LAUNCH_PICK_LOCALE_EMULATOR_PATH: 'launch:pick-locale-emulator-path',
  LAUNCH_SET_CONFIG: 'launch:set-config',
  LAUNCH_GAME: 'launch:launch-game',
  SAVE_PICK_FOLDER: 'save:pick-folder',
  SAVE_SET_PATH: 'save:set-path',
  SAVE_LIST_SNAPSHOTS: 'save:list-snapshots',
  SAVE_CREATE_SNAPSHOT: 'save:create-snapshot',
  SAVE_RESTORE_SNAPSHOT: 'save:restore-snapshot',
  SAVE_DIFF: 'save:diff',
  SAVE_LIST_GAMES_WITH_SAVE_PATH: 'save:list-games-with-save-path',
  SAVE_SET_SNAPSHOT_LABEL: 'save:set-snapshot-label',
  SAVE_DELETE_SNAPSHOT: 'save:delete-snapshot',
  SAVE_DELETE_ALL_SNAPSHOTS: 'save:delete-all-snapshots',
  SAVE_SHOW_SNAPSHOT_IN_FOLDER: 'save:show-snapshot-in-folder',
  SAVE_CHECK_VERSION_MISMATCH: 'save:check-version-mismatch',
  MEDIA_OPEN_PLAYER_WINDOW: 'media:open-player-window',
  MEDIA_PLAYER_WINDOW_CLOSED: 'media:player-window-closed',
  MEDIA_STATE_BROADCAST: 'media:state-broadcast',
  MEDIA_STATE_SYNC: 'media:state-sync',
  // A newly-opened (or any) window can ask every OTHER window to
  // re-broadcast its current MediaSyncState - a pull-based backstop for
  // MEDIA_OPEN_PLAYER_WINDOW's one-shot did-finish-load push, which can race
  // ahead of the new window's React mount (see useMediaPlayerSync.ts). Both
  // fire-and-forget, no request/response schema.
  MEDIA_REQUEST_STATE_SYNC: 'media:request-state-sync',
  MEDIA_STATE_SYNC_REQUESTED: 'media:state-sync-requested',
  SUBTITLE_PIP_OPEN: 'subtitle-pip:open',
  SUBTITLE_PIP_CLOSE: 'subtitle-pip:close',
  SUBTITLE_PIP_OPENED: 'subtitle-pip:opened',
  SUBTITLE_PIP_CLOSED: 'subtitle-pip:closed',
  SUBTITLE_PIP_LINE_UPDATE: 'subtitle-pip:line-update',
  MEDIA_GET_LYRICS: 'media:get-lyrics',
  MEDIA_CHECK_NEEDS_REMUX: 'media:check-needs-remux',
  MPV_LOAD: 'mpv:load',
  MPV_PLAY: 'mpv:play',
  MPV_PAUSE: 'mpv:pause',
  MPV_SEEK: 'mpv:seek',
  MPV_SET_VOLUME: 'mpv:set-volume',
  MPV_SET_EQ_BAND: 'mpv:set-eq-band',
  MPV_BECOME_HOST: 'mpv:become-host',
  MPV_RESIZE: 'mpv:resize',
  MPV_REQUEST_FRAME_PORT: 'mpv:request-frame-port',
  MPV_STATE_UPDATE: 'mpv:state-update',
  // Push-only, main -> renderer, no payload: the current track reached its
  // natural end (detected in mpvWorker.ts from mpv's own keep-open pause -
  // see pollAndForwardEvents there). Drives auto-advance / repeat-one in
  // useMediaPlayback.ts.
  MPV_ENDED: 'mpv:ended',
  MEDIA_THUMBNAIL_PICK_FILE: 'media-thumbnail:pick-file',
  MEDIA_THUMBNAIL_SET_FROM_FILE: 'media-thumbnail:set-from-file',
  GAME_ENTRY_EXCLUDE: 'game-entry:exclude',
  GAME_ENTRY_RESTORE: 'game-entry:restore',
  GAME_ENTRY_LIST_EXCLUDED: 'game-entry:list-excluded',
  MENU_OPEN_EXCLUDED_ENTRIES_DIALOG: 'menu:open-excluded-entries-dialog',
  CACHE_CLEAR: 'cache:clear',
  UPDATE_GET_VERSION: 'update:get-version',
  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL: 'update:install',
  // Lets a freshly-mounted renderer (e.g. the user opening Settings after a
  // silent background check already finished elsewhere) catch up on
  // whatever the update lifecycle's current state is, rather than only
  // ever starting from 'idle' and missing anything that already happened.
  UPDATE_GET_STATUS: 'update:get-status',
  // Push-only, main -> renderer: fired whenever the update check/download
  // lifecycle advances. No request/response schema.
  UPDATE_STATUS: 'update:status',
  MEDIA_PLAYLIST_LIST: 'media-playlist:list',
  MEDIA_PLAYLIST_CREATE: 'media-playlist:create',
  MEDIA_PLAYLIST_RENAME: 'media-playlist:rename',
  MEDIA_PLAYLIST_DELETE: 'media-playlist:delete',
  MEDIA_PLAYLIST_GET_TRACKS: 'media-playlist:get-tracks',
  MEDIA_PLAYLIST_SET_TRACKS: 'media-playlist:set-tracks',
  MEDIA_PLAYLIST_COVER_PICK_FILE: 'media-playlist:cover-pick-file',
  MEDIA_PLAYLIST_SET_COVER: 'media-playlist:set-cover',
  MEDIA_PLAYLIST_CLEAR_COVER: 'media-playlist:clear-cover',
  MEDIA_TRACK_LIKE_LIST: 'media-track-like:list',
  MEDIA_TRACK_LIKE_IS_LIKED: 'media-track-like:is-liked',
  MEDIA_TRACK_LIKE_TOGGLE: 'media-track-like:toggle',
} as const

export const ThemeSchema = z.enum(['light', 'dark'])
export type Theme = z.infer<typeof ThemeSchema>

export const WindowCloseBehaviorSchema = z.enum(['ask', 'quit', 'tray'])
export type WindowCloseBehavior = z.infer<typeof WindowCloseBehaviorSchema>

export const LocaleSchema = z.enum(['ko', 'ja', 'en'])
export type Locale = z.infer<typeof LocaleSchema>

export const SettingKeySchema = z.enum([
  'theme',
  'sidebar-width',
  'locale-emulator-path',
  'locale',
  'media-folder',
  'explorer-tree-open',
  'explorer-tree-width',
  'external-metadata-provider-enabled',
  'external-metadata-provider-url',
  'external-metadata-provider-api-key',
  'window-close-behavior',
  'media-sidebar-open',
  'media-sidebar-width',
  'media-view-mode',
  'subtitle-pip-x',
  'subtitle-pip-y',
  'subtitle-pip-width',
  'subtitle-pip-height',
  'media-volume',
])
export type SettingKey = z.infer<typeof SettingKeySchema>

export const GetSettingRequestSchema = z.object({
  key: SettingKeySchema,
})
export type GetSettingRequest = z.infer<typeof GetSettingRequestSchema>

export const SetSettingRequestSchema = z.object({
  key: SettingKeySchema,
  value: z.string(),
})
export type SetSettingRequest = z.infer<typeof SetSettingRequestSchema>

export const LibrarySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  createdAt: z.string(),
})
export type Library = z.infer<typeof LibrarySchema>

// libraries:list enriches each stored Library with a live filesystem check
// (not persisted - computed fresh on every list call) so Settings can warn
// when a registered path has been deleted or an external drive is unplugged.
export interface LibraryWithStatus extends Library {
  exists: boolean
}

export const AddLibraryRequestSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
})
export type AddLibraryRequest = z.infer<typeof AddLibraryRequestSchema>

export const RemoveLibraryRequestSchema = z.object({
  id: z.string(),
})
export type RemoveLibraryRequest = z.infer<typeof RemoveLibraryRequestSchema>

export const ScanRecursiveRequestSchema = z.object({
  libraryPaths: z.array(z.string()),
})
export type ScanRecursiveRequest = z.infer<typeof ScanRecursiveRequestSchema>

export const ScanShallowRequestSchema = z.object({
  dirPath: z.string(),
})
export type ScanShallowRequest = z.infer<typeof ScanShallowRequestSchema>

export const PersistedExplorerTabSchema = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string(),
  position: z.number(),
  isActive: z.boolean(),
  viewMode: z.enum(['list', 'grid']),
})
export type PersistedExplorerTab = z.infer<typeof PersistedExplorerTabSchema>

export const SaveExplorerTabsRequestSchema = z.object({
  tabs: z.array(PersistedExplorerTabSchema),
})
export type SaveExplorerTabsRequest = z.infer<typeof SaveExplorerTabsRequestSchema>

export const SortPageSchema = z.enum(['gallery', 'list', 'explorer', 'detail-list'])
export type SortPage = z.infer<typeof SortPageSchema>

export const SortFieldSchema = z.enum(['name', 'mtime', 'extension'])
export type SortField = z.infer<typeof SortFieldSchema>

export const SortDirectionSchema = z.enum(['asc', 'desc'])
export type SortDirection = z.infer<typeof SortDirectionSchema>

export const GetSortRequestSchema = z.object({
  page: SortPageSchema,
})
export type GetSortRequest = z.infer<typeof GetSortRequestSchema>

export const SetSortRequestSchema = z.object({
  page: SortPageSchema,
  field: SortFieldSchema,
  direction: SortDirectionSchema,
})
export type SetSortRequest = z.infer<typeof SetSortRequestSchema>

export interface SortPreference {
  field: SortField
  direction: SortDirection
}

export const GameCodeSchema = z.object({
  type: z.enum(['RJ', 'VJ', 'ST', 'VNV', 'VNR', 'GC']),
  value: z.string(),
})

export const OpenExternalRequestSchema = z.object({
  code: GameCodeSchema,
})
export type OpenExternalRequest = z.infer<typeof OpenExternalRequestSchema>

export const ShowItemInFolderRequestSchema = z.object({
  path: z.string(),
})
export type ShowItemInFolderRequest = z.infer<typeof ShowItemInFolderRequestSchema>

export const OpenPathRequestSchema = z.object({
  path: z.string(),
})
export type OpenPathRequest = z.infer<typeof OpenPathRequestSchema>

export const CrawlAndSaveMetadataRequestSchema = z.object({
  code: GameCodeSchema,
})
export type CrawlAndSaveMetadataRequest = z.infer<typeof CrawlAndSaveMetadataRequestSchema>

export const GetMetadataRequestSchema = z.object({
  code: GameCodeSchema,
})
export type GetMetadataRequest = z.infer<typeof GetMetadataRequestSchema>

export const GetMetadataFailureRequestSchema = z.object({
  code: GameCodeSchema,
})
export type GetMetadataFailureRequest = z.infer<typeof GetMetadataFailureRequestSchema>

export const GetManyMetadataRequestSchema = z.object({
  codes: z.array(z.string()),
})

export const GetCoverImageRequestSchema = z.object({
  code: GameCodeSchema,
})
export type GetCoverImageRequest = z.infer<typeof GetCoverImageRequestSchema>

export const MetadataSearchSourceSchema = z.enum(['dlsite', 'steam', 'vndb', 'getchu'])
export type MetadataSearchSource = z.infer<typeof MetadataSearchSourceSchema>

export const MetadataSearchRequestSchema = z.object({
  source: MetadataSearchSourceSchema,
  query: z.string(),
})
export type MetadataSearchRequest = z.infer<typeof MetadataSearchRequestSchema>

export interface MetadataSearchResultDto {
  code: z.infer<typeof GameCodeSchema>
  title: string
  thumbnailUrl: string | null
}

export const CrawlMissingMetadataRequestSchema = z.object({
  codes: z.array(GameCodeSchema),
})
export type CrawlMissingMetadataRequest = z.infer<typeof CrawlMissingMetadataRequestSchema>

export interface BulkCrawlProgressDto {
  completed: number
  total: number
}

export interface GameMetadataDto {
  code: string
  title: string | null
  circle: string | null
  releaseDate: string | null
  genres: string[]
  coverImagePath: string | null
  workType: string | null
}

export interface MetadataFailureDto {
  code: string
  attemptedSources: string[]
  reason: 'not_found' | 'blocked' | 'network' | 'parse' | 'provider_error'
  updatedAt: string
}

// 렌더러는 항상 code와 path를 함께 보낸다 - 실제 키 도출(코드 있으면 코드,
// 없으면 경로 정규화)은 정규화 로직이 이미 있는 main 프로세스에서만 한다.
export const GameEntryIdentifierSchema = z.object({
  code: GameCodeSchema.nullable(),
  path: z.string(),
})

// Path-only, deliberately not GameEntryIdentifierSchema - excluding is
// "hide this specific file/folder", not "hide this game", so it never
// resolves through resolveGameEntryKey's code-preferring identity the way
// favorites/ratings/etc. do (see excludedEntries table's own comment).
export const ExcludeEntryRequestSchema = z.object({
  path: z.string(),
  name: z.string(),
})
export type ExcludeEntryRequest = z.infer<typeof ExcludeEntryRequestSchema>

export const RestoreEntryRequestSchema = z.object({
  path: z.string(),
})
export type RestoreEntryRequest = z.infer<typeof RestoreEntryRequestSchema>

export interface ExcludedEntryDto {
  path: string
  name: string
  excludedAt: string
}

export const SetFavoriteRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  isFavorite: z.boolean(),
})
export type SetFavoriteRequest = z.infer<typeof SetFavoriteRequestSchema>

export const SetClearedRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  isCleared: z.boolean(),
})
export type SetClearedRequest = z.infer<typeof SetClearedRequestSchema>

export const SetRatingAndMemoRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  rating: z.number().min(1).max(5).nullable(),
  memo: z.string().nullable(),
})
export type SetRatingAndMemoRequest = z.infer<typeof SetRatingAndMemoRequestSchema>

export const GetGameUserDataRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
})
export type GetGameUserDataRequest = z.infer<typeof GetGameUserDataRequestSchema>

export const LinkCodeRequestSchema = z.object({
  path: z.string(),
  code: GameCodeSchema,
})
export type LinkCodeRequest = z.infer<typeof LinkCodeRequestSchema>

export const UnlinkCodeRequestSchema = z.object({
  path: z.string(),
})
export type UnlinkCodeRequest = z.infer<typeof UnlinkCodeRequestSchema>

export interface GameUserDataDto {
  isFavorite: boolean
  isCleared: boolean
  rating: number | null
  memo: string | null
  totalPlaytimeMs: number
  launchConfig: LaunchConfigDto | null
  customCoverPath: string | null
  savePath: string | null
}

export const SetCustomCoverFromFileRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  path: z.string(),
})
export type SetCustomCoverFromFileRequest = z.infer<typeof SetCustomCoverFromFileRequestSchema>

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

export const SetSavePathRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  savePath: z.string(),
})

export const PickSaveFolderRequestSchema = z.object({
  startPath: z.string().nullable(),
})

export const SaveSnapshotRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
})

export interface SaveSnapshotDto {
  timestamp: string
  fileCount: number
  totalSizeBytes: number
  memo: string | null
  version: string | null
}

// Must match timestampToDirName's output exactly (createSnapshot.ts) - this
// value is joined directly into a filesystem path as a directory name on
// the main process side (saveHandlers.ts), so anything looser than the
// shape that function actually produces (e.g. a path-separator-containing
// string) would let a crafted timestamp escape the intended backup folder.
const SNAPSHOT_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/

export const RestoreSaveSnapshotRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  timestamp: z.string().regex(SNAPSHOT_TIMESTAMP_PATTERN),
})

export const SaveDiffRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  timestamp: z.string().regex(SNAPSHOT_TIMESTAMP_PATTERN).nullable(),
})

export const SetSnapshotLabelRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  timestamp: z.string().regex(SNAPSHOT_TIMESTAMP_PATTERN),
  memo: z.string().optional(),
  version: z.string().optional(),
})

export const DeleteSnapshotRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  timestamp: z.string().regex(SNAPSHOT_TIMESTAMP_PATTERN),
})

export const DeleteAllSnapshotsRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
})

export const ShowSnapshotInFolderRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  timestamp: z.string().regex(SNAPSHOT_TIMESTAMP_PATTERN),
})

export const CheckVersionMismatchRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  timestamp: z.string().regex(SNAPSHOT_TIMESTAMP_PATTERN),
})

export interface VersionMismatchDto {
  snapshotVersion: string | null
  currentVersion: string | null
  isSnapshotNewer: boolean
}

export type SaveDiffStatus = 'added' | 'removed' | 'modified'

export interface SaveDiffEntryDto {
  relativePath: string
  status: SaveDiffStatus
}

export interface GameWithSavePathDto {
  key: string
  savePath: string
}

export const ClearCacheRequestSchema = z.object({
  deleteSaveBackups: z.boolean(),
})
export type ClearCacheRequest = z.infer<typeof ClearCacheRequestSchema>

export const RenameEntriesRequestSchema = z.object({
  renames: z.array(z.object({ path: z.string(), newName: z.string() })),
})
export type RenameEntriesRequest = z.infer<typeof RenameEntriesRequestSchema>

export interface RenameResultDto {
  path: string
  success: boolean
  newPath?: string
  error?: string
}

export const DeleteEntriesRequestSchema = z.object({
  paths: z.array(z.string()),
})
export type DeleteEntriesRequest = z.infer<typeof DeleteEntriesRequestSchema>

export interface DeleteResultDto {
  path: string
  success: boolean
  error?: string
}

export const MoveEntriesRequestSchema = z.object({
  paths: z.array(z.string()),
  destDir: z.string(),
})
export type MoveEntriesRequest = z.infer<typeof MoveEntriesRequestSchema>

export interface MoveResultDto {
  path: string
  success: boolean
  newPath?: string
  error?: string
}

export interface MediaTrackDto {
  path: string
  name: string
}

export const MediaTrackSchema = z.object({
  path: z.string(),
  name: z.string(),
})

// The media player's cross-window control-plane snapshot (see
// src/stores/mediaPlayerStore.ts and useMediaPlayerSync) - relayed as-is
// between the main window and the detached player window through the main
// process. Deliberately excludes currentTime/duration, which change too
// often (~4x/sec during playback) to broadcast this way and stay local to
// whichever window is actually hosting playback.
export const MediaRepeatModeSchema = z.enum(['off', 'all', 'one'])
export type MediaRepeatMode = z.infer<typeof MediaRepeatModeSchema>

export const MediaSyncStateSchema = z.object({
  playlist: z.array(MediaTrackSchema),
  currentIndex: z.number().nullable(),
  isPlaying: z.boolean(),
  volume: z.number(),
  previousVolume: z.number(),
  repeatMode: MediaRepeatModeSchema,
  shuffleMode: z.boolean(),
  shuffleOrder: z.array(z.number()),
  shufflePosition: z.number(),
  isDetached: z.boolean(),
})
export type MediaSyncState = z.infer<typeof MediaSyncStateSchema>

export const MediaGetLyricsRequestSchema = z.object({
  filePath: z.string(),
})
export type MediaGetLyricsRequest = z.infer<typeof MediaGetLyricsRequestSchema>

export const MediaCheckNeedsRemuxRequestSchema = z.object({
  filePath: z.string(),
})
export type MediaCheckNeedsRemuxRequest = z.infer<typeof MediaCheckNeedsRemuxRequestSchema>

// `isVideo` gates the utility process's per-frame render loop: an audio-only
// track must not pay the ~16ms renderFrame/postMessage cost, so the worker
// falls back to a much cheaper 250ms event-poll + state-push interval when
// this is false. The renderer decides it (it already knows the track's media
// type) rather than the worker probing mpv for a video stream, which would
// only be answerable asynchronously after loadfile resolves.
export const MpvLoadRequestSchema = z.object({
  filePath: z.string(),
  isVideo: z.boolean(),
})
export type MpvLoadRequest = z.infer<typeof MpvLoadRequestSchema>

export const MpvResizeRequestSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
export type MpvResizeRequest = z.infer<typeof MpvResizeRequestSchema>

export const MpvSeekRequestSchema = z.object({
  seconds: z.number(),
})
export type MpvSeekRequest = z.infer<typeof MpvSeekRequestSchema>

export const MpvSetVolumeRequestSchema = z.object({
  volume: z.number().min(0).max(1),
})
export type MpvSetVolumeRequest = z.infer<typeof MpvSetVolumeRequestSchema>

export const MpvSetEqBandRequestSchema = z.object({
  bandIndex: z.number().int().min(0).max(4),
  gainDb: z.number().min(-12).max(12),
})
export type MpvSetEqBandRequest = z.infer<typeof MpvSetEqBandRequestSchema>

// Pushed from main to whichever window(s) need to know playback state
// without hosting the video themselves (e.g. the sidebar's lyrics tab, the
// subtitle PIP window) - NOT re-validated on the way out, per this
// project's established convention (main process is trusted).
export const MpvStateUpdateSchema = z.object({
  isPlaying: z.boolean(),
  currentTime: z.number(),
  duration: z.number().nullable(),
  error: z.string().nullable(),
})
export type MpvStateUpdate = z.infer<typeof MpvStateUpdateSchema>

// PIP 창(subtitle-pip:line-update)이 표시할 상태 - 호스팅 중인 창이 계산해
// 메인 프로세스로 보내면(렌더러→메인이 신뢰 경계이므로 메인 프로세스의 핸들러가
// 이 스키마로 검증한다) 그대로 PIP 창에 릴레이된다. 'line' 외 세 값은 PIP가
// 무엇을 보여줄지 스스로 판단하지 않고 항상 호스팅 중인 창이 명시적으로
// 알려주기 위함 - 'no-active-line'은 동기화된 자막은 있지만 지금 이 순간
// 표시할 줄이 없는 경우(첫 줄 이전 등), PIP는 이 값을 받으면 마지막 'line'
// 값을 화면에 그대로 유지한다(일시정지 요구사항과 동일 처리).
export const SubtitleLinePayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('line'), text: z.string() }),
  z.object({ kind: z.literal('no-active-line') }),
  z.object({ kind: z.literal('no-lyrics') }),
  z.object({ kind: z.literal('no-track') }),
])
export type SubtitleLinePayload = z.infer<typeof SubtitleLinePayloadSchema>

export const SetMediaThumbnailFromFileRequestSchema = z.object({
  filePath: z.string(),
  sourcePath: z.string(),
})
export type SetMediaThumbnailFromFileRequest = z.infer<
  typeof SetMediaThumbnailFromFileRequestSchema
>

export interface SetMediaThumbnailFromFileResult {
  mode: 'embedded' | 'override'
  warning?: string
}

export interface ReleaseNote {
  version: string
  note: string
}

// Pushed to the renderer as the auto-update lifecycle advances (see
// electron/main/updater.ts) - a discriminated union rather than separate
// booleans/nullable fields so the renderer can never observe an
// inconsistent combination (e.g. "downloading" with no percent).
// releaseNotes covers every version between the currently-running one and
// the target (not just the target's own notes), since electron-updater
// itself reports it that way when skipping over several releases at once.
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; releaseNotes: ReleaseNote[] }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string; releaseNotes: ReleaseNote[] }
  | { state: 'error'; message: string }

export interface MediaPlaylistDto {
  id: string
  name: string
  trackCount: number
  coverImagePath: string | null
  createdAt: string
  updatedAt: string
}

export interface MediaPlaylistTrackDto {
  path: string
  name: string
}

export const CreateMediaPlaylistRequestSchema = z.object({
  name: z.string().min(1),
})
export type CreateMediaPlaylistRequest = z.infer<typeof CreateMediaPlaylistRequestSchema>

export const RenameMediaPlaylistRequestSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
})
export type RenameMediaPlaylistRequest = z.infer<typeof RenameMediaPlaylistRequestSchema>

export const DeleteMediaPlaylistRequestSchema = z.object({
  id: z.string(),
})
export type DeleteMediaPlaylistRequest = z.infer<typeof DeleteMediaPlaylistRequestSchema>

export const GetMediaPlaylistTracksRequestSchema = z.object({
  id: z.string(),
})
export type GetMediaPlaylistTracksRequest = z.infer<typeof GetMediaPlaylistTracksRequestSchema>

export const SetMediaPlaylistTracksRequestSchema = z.object({
  id: z.string(),
  tracks: z.array(MediaTrackSchema),
})
export type SetMediaPlaylistTracksRequest = z.infer<typeof SetMediaPlaylistTracksRequestSchema>

export const SetMediaPlaylistCoverRequestSchema = z.object({
  playlistId: z.string(),
  sourcePath: z.string(),
})
export type SetMediaPlaylistCoverRequest = z.infer<typeof SetMediaPlaylistCoverRequestSchema>

export const ClearMediaPlaylistCoverRequestSchema = z.object({
  playlistId: z.string(),
})
export type ClearMediaPlaylistCoverRequest = z.infer<typeof ClearMediaPlaylistCoverRequestSchema>

export const IsTrackLikedRequestSchema = z.object({
  path: z.string(),
})
export type IsTrackLikedRequest = z.infer<typeof IsTrackLikedRequestSchema>

export const ToggleTrackLikeRequestSchema = z.object({
  path: z.string(),
  name: z.string(),
})
export type ToggleTrackLikeRequest = z.infer<typeof ToggleTrackLikeRequestSchema>
