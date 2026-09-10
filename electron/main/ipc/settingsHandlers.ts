import { ipcMain } from 'electron'
import {
  GetSettingRequestSchema,
  IPC_CHANNELS,
  LocaleSchema,
  SetSettingRequestSchema,
  ThemeSchema,
  WindowCloseBehaviorSchema,
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

// Same self-healing principle as parseStoredSidebarWidth, for the explorer
// sidebar's persisted width.
function parseStoredExplorerTreeWidth(raw: string | undefined): string | null {
  if (raw === undefined) return null
  return Number.isFinite(Number(raw)) ? raw : null
}

// Same self-healing principle as parseStoredTheme, for the explorer
// sidebar's open/closed flag - a corrupted DB row falls back to null
// (treated as "no persisted value") instead of an invalid string reaching
// the renderer as if it were a valid boolean flag.
function parseStoredExplorerTreeOpen(raw: string | undefined): string | null {
  if (raw === undefined) return null
  return raw === 'true' || raw === 'false' ? raw : null
}

function parseStoredExternalMetadataProviderEnabled(raw: string | undefined): string | null {
  if (raw === undefined) return null
  return raw === 'true' || raw === 'false' ? raw : null
}

// Same self-healing principle as parseStoredExplorerTreeOpen, for the media
// sidebar's own open/closed flag.
function parseStoredMediaSidebarOpen(raw: string | undefined): string | null {
  if (raw === undefined) return null
  return raw === 'true' || raw === 'false' ? raw : null
}

// Same self-healing principle as parseStoredExplorerTreeWidth, for the media
// sidebar's persisted width.
function parseStoredMediaSidebarWidth(raw: string | undefined): string | null {
  if (raw === undefined) return null
  return Number.isFinite(Number(raw)) ? raw : null
}

// Same self-healing principle as parseStoredTheme, for the Media tab's
// list/grid view mode.
function parseStoredMediaViewMode(raw: string | undefined): 'list' | 'grid' | null {
  if (raw === undefined) return null
  return raw === 'list' || raw === 'grid' ? raw : null
}

function parseStoredWindowCloseBehavior(raw: string | undefined): 'ask' | 'quit' | 'tray' | null {
  if (raw === undefined) return null
  const result = WindowCloseBehaviorSchema.safeParse(raw)
  return result.success ? result.data : null
}

// Same self-healing principle as parseStoredSidebarWidth, for the media
// player's own persisted volume - a corrupted/out-of-range value falls back
// to null (treated as "no persisted value") rather than reaching the
// renderer as if it were a valid 0-1 volume.
function parseStoredMediaVolume(raw: string | undefined): string | null {
  if (raw === undefined) return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 && value <= 1 ? raw : null
}

// Number of EQ bands the whole app agrees on. Deliberately hardcoded rather
// than imported from src/lib/equalizerPresets.ts's EQ_BAND_COUNT: the main
// process's tsconfig (tsconfig.node.json) only includes electron/** and
// shared/**, so src/ is not importable here and no other main-process file
// cross-imports from it either. MUST stay in sync with EQ_BAND_COUNT (and
// with mpv_addon.cc's Init(), which installs exactly this many `eqN` filters).
const EQ_BAND_COUNT = 5

// Same self-healing principle as parseStoredMediaVolume, for the media
// player's 5-band equalizer - stored as one JSON array of dB gains under a
// single key. Returns the PARSED gains (not the raw string) because the
// main process itself needs them: mpvHandlers.ts re-applies them to a
// freshly-initialized mpv session. A missing/malformed/wrong-length/
// out-of-range value self-heals to null, which every caller treats as "no
// persisted EQ", i.e. leave the addon's own flat Init() default alone.
// The -12..12 range check matches both MpvSetEqBandRequestSchema and the
// popover's slider bounds, so a corrupted row can't push mpv outside the
// range the rest of the app guarantees.
export function parseStoredMediaEqualizerBands(raw: string | undefined): number[] | null {
  if (raw === undefined) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length !== EQ_BAND_COUNT) return null
  if (!parsed.every((g) => typeof g === 'number' && Number.isFinite(g) && g >= -12 && g <= 12)) {
    return null
  }
  return parsed as number[]
}

export function registerSettingsHandlers(
  db: AppDatabase,
  // Fired synchronously after a setting is persisted, with the exact
  // (key, value) pair just written - index.ts uses this to rebuild the
  // native application menu when 'locale' changes, since (unlike a dialog,
  // which reads getSetting fresh every time it's about to show - see
  // windowCloseBehavior.ts's getWindowClosePrompt) Electron's menu bar is a
  // static object that never re-reads anything on its own once
  // Menu.setApplicationMenu() has been called.
  onSettingChanged?: (key: string, value: string) => void
): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, payload: unknown) => {
    const { key } = GetSettingRequestSchema.parse(payload)
    if (key === 'theme') return parseStoredTheme(getSetting(db, key))
    if (key === 'sidebar-width') return parseStoredSidebarWidth(getSetting(db, key))
    if (key === 'locale') return parseStoredLocale(getSetting(db, key))
    if (key === 'explorer-tree-width') return parseStoredExplorerTreeWidth(getSetting(db, key))
    if (key === 'explorer-tree-open') return parseStoredExplorerTreeOpen(getSetting(db, key))
    if (key === 'external-metadata-provider-enabled') {
      return parseStoredExternalMetadataProviderEnabled(getSetting(db, key))
    }
    if (key === 'window-close-behavior') {
      return parseStoredWindowCloseBehavior(getSetting(db, key))
    }
    if (key === 'media-sidebar-open') return parseStoredMediaSidebarOpen(getSetting(db, key))
    if (key === 'media-sidebar-width') return parseStoredMediaSidebarWidth(getSetting(db, key))
    if (key === 'media-view-mode') return parseStoredMediaViewMode(getSetting(db, key))
    if (key === 'media-volume') return parseStoredMediaVolume(getSetting(db, key))
    if (key === 'media-equalizer-bands') {
      // Re-serialized rather than passed through raw: the IPC contract for
      // this key is a JSON string (see preload's getMediaEqualizerBands), and
      // re-stringifying the validated array is what makes the value the
      // renderer sees canonical instead of whatever formatting the row held.
      const bands = parseStoredMediaEqualizerBands(getSetting(db, key))
      return bands === null ? null : JSON.stringify(bands)
    }
    return getSetting(db, key) ?? null
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, payload: unknown) => {
    const { key, value } = SetSettingRequestSchema.parse(payload)
    setSetting(db, key, value)
    onSettingChanged?.(key, value)
  })

  // Synchronous read used only at renderer boot to apply the persisted theme
  // before first paint (avoids a flash of the wrong theme while the async
  // React Query fetch resolves). Scoped to the 'theme' key only.
  ipcMain.on(IPC_CHANNELS.SETTINGS_GET_SYNC, (event) => {
    event.returnValue = parseStoredTheme(getSetting(db, 'theme'))
  })
}
