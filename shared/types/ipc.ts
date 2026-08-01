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
  SORT_GET: 'sort:get',
  SORT_SET: 'sort:set',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  SHELL_SHOW_ITEM_IN_FOLDER: 'shell:show-item-in-folder',
  METADATA_CRAWL_AND_SAVE: 'metadata:crawl-and-save',
  METADATA_GET: 'metadata:get',
  METADATA_GET_MANY: 'metadata:get-many',
  METADATA_GET_COVER_IMAGE: 'metadata:get-cover-image',
  METADATA_SEARCH_DLSITE: 'metadata:search-dlsite',
  // Enqueues codes with no game_metadata row yet for background crawling,
  // one at a time with a delay between requests (see bulkCrawlQueue.ts) -
  // fire-and-forget, resolves once the codes are queued, not once crawled.
  METADATA_CRAWL_MISSING: 'metadata:crawl-missing',
  // Push-only, main -> renderer: fired after each queued code finishes
  // crawling (success or failure). No request/response schema.
  METADATA_BULK_CRAWL_PROGRESS: 'metadata:bulk-crawl-progress',
  GAME_USER_DATA_GET: 'game-user-data:get',
  GAME_USER_DATA_SET_FAVORITE: 'game-user-data:set-favorite',
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
  SAVE_BACKUP_NOW: 'save:backup-now',
  CACHE_CLEAR: 'cache:clear',
} as const

export const ThemeSchema = z.enum(['light', 'dark'])
export type Theme = z.infer<typeof ThemeSchema>

export const SettingKeySchema = z.enum(['theme', 'sidebar-width', 'locale-emulator-path'])

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
  type: z.enum(['RJ', 'VJ', 'ST']),
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

export const CrawlAndSaveMetadataRequestSchema = z.object({
  code: GameCodeSchema,
})
export type CrawlAndSaveMetadataRequest = z.infer<typeof CrawlAndSaveMetadataRequestSchema>

export const GetMetadataRequestSchema = z.object({
  code: GameCodeSchema,
})
export type GetMetadataRequest = z.infer<typeof GetMetadataRequestSchema>

export const GetManyMetadataRequestSchema = z.object({
  codes: z.array(z.string()),
})

export const GetCoverImageRequestSchema = z.object({
  code: GameCodeSchema,
})
export type GetCoverImageRequest = z.infer<typeof GetCoverImageRequestSchema>

export const SearchDlsiteRequestSchema = z.object({
  query: z.string(),
})
export type SearchDlsiteRequest = z.infer<typeof SearchDlsiteRequestSchema>

export interface DlsiteSearchResultDto {
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
}

// 렌더러는 항상 code와 path를 함께 보낸다 - 실제 키 도출(코드 있으면 코드,
// 없으면 경로 정규화)은 정규화 로직이 이미 있는 main 프로세스에서만 한다.
export const GameEntryIdentifierSchema = z.object({
  code: GameCodeSchema.nullable(),
  path: z.string(),
})

export const SetFavoriteRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  isFavorite: z.boolean(),
})
export type SetFavoriteRequest = z.infer<typeof SetFavoriteRequestSchema>

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
  rating: number | null
  memo: string | null
  totalPlaytimeMs: number
  launchConfig: LaunchConfigDto | null
  customCoverPath: string | null
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

export const BackupSaveNowRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
})

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
