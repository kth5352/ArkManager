import { z } from 'zod'

export const IPC_CHANNELS = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_SYNC: 'settings:get-sync',
  LIBRARIES_LIST: 'libraries:list',
  LIBRARIES_ADD: 'libraries:add',
  LIBRARIES_REMOVE: 'libraries:remove',
  LIBRARIES_PICK_FOLDER: 'libraries:pick-folder',
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
