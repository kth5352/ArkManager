import { z } from 'zod'

export const IPC_CHANNELS = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
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
  value: z.string(),
})
export type SetSettingRequest = z.infer<typeof SetSettingRequestSchema>
