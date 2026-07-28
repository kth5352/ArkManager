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
