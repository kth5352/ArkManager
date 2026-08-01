import { ipcMain } from 'electron'
import {
  GetSettingRequestSchema,
  IPC_CHANNELS,
  LocaleSchema,
  SetSettingRequestSchema,
  ThemeSchema,
} from '../../../shared/types/ipc'
import { getSetting, setSetting } from '../database/settingsRepository'
import type { AppDatabase } from '../database/client'

// Validates a raw DB string against ThemeSchema before it reaches the
// renderer. A corrupted or manually-edited DB row would otherwise silently
// produce a value that's typed as Theme but isn't actually 'light' | 'dark' -
// this self-heals to null (treated as "no persisted value" / default theme)
// instead of propagating the bad value.
function parseStoredTheme(raw: string | undefined): 'light' | 'dark' | null {
  if (raw === undefined) return null
  const result = ThemeSchema.safeParse(raw)
  return result.success ? result.data : null
}

// Same self-healing principle as parseStoredTheme, for 'locale'.
function parseStoredLocale(raw: string | undefined): 'ko' | 'ja' | 'en' | null {
  if (raw === undefined) return null
  const result = LocaleSchema.safeParse(raw)
  return result.success ? result.data : null
}

// Same self-healing principle as parseStoredTheme, for the other key that
// can actually be read back (SettingKeySchema currently only allows
// 'theme' | 'sidebar-width'). The renderer's own clampSidebarWidth already
// guards against NaN once the value reaches it, but that's an accident of
// the renderer's code, not a guarantee this IPC contract makes - a
// corrupted or manually-edited DB row (e.g. "abc") would otherwise cross
// the IPC boundary as a string that looks valid but Number()s to NaN.
// Self-heals to null here instead, exactly like theme.
function parseStoredSidebarWidth(raw: string | undefined): string | null {
  if (raw === undefined) return null
  return Number.isFinite(Number(raw)) ? raw : null
}

export function registerSettingsHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, payload: unknown) => {
    const { key } = GetSettingRequestSchema.parse(payload)
    if (key === 'theme') return parseStoredTheme(getSetting(db, key))
    if (key === 'sidebar-width') return parseStoredSidebarWidth(getSetting(db, key))
    if (key === 'locale') return parseStoredLocale(getSetting(db, key))
    return getSetting(db, key) ?? null
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, payload: unknown) => {
    const { key, value } = SetSettingRequestSchema.parse(payload)
    setSetting(db, key, value)
  })

  // Synchronous read used only at renderer boot to apply the persisted theme
  // before first paint (avoids a flash of the wrong theme while the async
  // React Query fetch resolves). Scoped to the 'theme' key only.
  ipcMain.on(IPC_CHANNELS.SETTINGS_GET_SYNC, (event) => {
    event.returnValue = parseStoredTheme(getSetting(db, 'theme'))
  })
}
