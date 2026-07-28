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
  SCANNER_GET_THUMBNAIL: 'scanner:get-thumbnail',
  EXPLORER_SAVE_TABS: 'explorer:save-tabs',
  EXPLORER_LOAD_TABS: 'explorer:load-tabs',
  SORT_GET: 'sort:get',
  SORT_SET: 'sort:set',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  METADATA_CRAWL_AND_SAVE: 'metadata:crawl-and-save',
  METADATA_GET: 'metadata:get',
  GAME_USER_DATA_GET: 'game-user-data:get',
  GAME_USER_DATA_SET_FAVORITE: 'game-user-data:set-favorite',
  GAME_USER_DATA_SET_RATING_AND_MEMO: 'game-user-data:set-rating-and-memo',
} as const

export const ThemeSchema = z.enum(['light', 'dark'])
export type Theme = z.infer<typeof ThemeSchema>

export const SettingKeySchema = z.enum(['theme'])

export const GetSettingRequestSchema = z.object({
  key: SettingKeySchema,
})
export type GetSettingRequest = z.infer<typeof GetSettingRequestSchema>

export const SetSettingRequestSchema = z.object({
  key: SettingKeySchema,
  value: ThemeSchema,
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

export const GetThumbnailRequestSchema = z.object({
  entryPath: z.string(),
})
export type GetThumbnailRequest = z.infer<typeof GetThumbnailRequestSchema>

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

export const SortPageSchema = z.enum(['gallery', 'list', 'explorer'])
export type SortPage = z.infer<typeof SortPageSchema>

export const SortFieldSchema = z.enum(['name', 'mtime'])
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

export const CrawlAndSaveMetadataRequestSchema = z.object({
  code: GameCodeSchema,
})
export type CrawlAndSaveMetadataRequest = z.infer<typeof CrawlAndSaveMetadataRequestSchema>

export const GetMetadataRequestSchema = z.object({
  code: GameCodeSchema,
})
export type GetMetadataRequest = z.infer<typeof GetMetadataRequestSchema>

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

export interface GameUserDataDto {
  isFavorite: boolean
  rating: number | null
  memo: string | null
}
