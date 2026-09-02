import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Locale, Theme, WindowCloseBehavior } from '../../shared/types/ipc'
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from '../lib/clampSidebarWidth'
import { clampExplorerTreeWidth, EXPLORER_TREE_WIDTH_DEFAULT } from '../lib/clampExplorerTreeWidth'
import { clampMediaSidebarWidth, MEDIA_SIDEBAR_WIDTH_DEFAULT } from '../lib/clampMediaSidebarWidth'
import { DEFAULT_LOCALE } from '../i18n/translations'

export const THEME_QUERY_KEY = ['settings', 'theme'] as const

// Seeds the theme query's cache with the value already applied synchronously
// at boot (see src/main.tsx), so the first render of useThemeQuery() returns
// the real persisted theme instead of falling back to a hardcoded default
// while the async fetch is in flight. Without this, useTheme.ts's effect
// would briefly re-apply the wrong fallback theme on mount, flashing it
// before the async query resolves and corrects it - the exact bug this is
// meant to eliminate, just moved one tick later.
export function seedThemeQueryData(queryClient: QueryClient, theme: Theme): void {
  queryClient.setQueryData(THEME_QUERY_KEY, theme)
}

// Synchronous read of the persisted theme, used only at boot (see
// src/main.tsx) to apply the theme class before first paint. Keeps the
// window.api call inside the service layer rather than in main.tsx directly.
export function readPersistedThemeSync(): Theme | null {
  return window.api.settings.getThemeSync()
}

export function useThemeQuery() {
  return useQuery({
    queryKey: THEME_QUERY_KEY,
    queryFn: async (): Promise<Theme> => {
      const value = await window.api.settings.getTheme()
      return value ?? 'dark'
    },
  })
}

export function useSetThemeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (theme: Theme) => window.api.settings.setTheme(theme),
    onSuccess: (_data, theme) => {
      queryClient.setQueryData(THEME_QUERY_KEY, theme)
    },
  })
}

export const WINDOW_CLOSE_BEHAVIOR_QUERY_KEY = ['settings', 'window-close-behavior'] as const

export function useWindowCloseBehaviorQuery() {
  return useQuery({
    queryKey: WINDOW_CLOSE_BEHAVIOR_QUERY_KEY,
    queryFn: async (): Promise<WindowCloseBehavior> => {
      const value = await window.api.settings.getWindowCloseBehavior()
      return value ?? 'ask'
    },
  })
}

export function useSetWindowCloseBehaviorMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (behavior: WindowCloseBehavior) =>
      window.api.settings.setWindowCloseBehavior(behavior),
    onSuccess: (_data, behavior) => {
      queryClient.setQueryData(WINDOW_CLOSE_BEHAVIOR_QUERY_KEY, behavior)
    },
  })
}

export const SIDEBAR_WIDTH_QUERY_KEY = ['settings', 'sidebar-width'] as const

export function useSidebarWidthQuery() {
  return useQuery({
    queryKey: SIDEBAR_WIDTH_QUERY_KEY,
    queryFn: async (): Promise<number> => {
      const value = await window.api.settings.getSidebarWidth()
      return value === null ? SIDEBAR_WIDTH_DEFAULT : clampSidebarWidth(value)
    },
  })
}

export function useSetSidebarWidthMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (width: number) => window.api.settings.setSidebarWidth(clampSidebarWidth(width)),
    onSuccess: (_data, width) => {
      queryClient.setQueryData(SIDEBAR_WIDTH_QUERY_KEY, clampSidebarWidth(width))
    },
  })
}

export const LOCALE_EMULATOR_PATH_QUERY_KEY = ['settings', 'locale-emulator-path'] as const

// Empty string means "no manual override" - detectLocaleEmulator (main
// process) falls back to auto-detecting known install locations in that
// case, same as before this setting existed.
export function useLocaleEmulatorPathQuery() {
  return useQuery({
    queryKey: LOCALE_EMULATOR_PATH_QUERY_KEY,
    queryFn: async (): Promise<string> => {
      const value = await window.api.settings.getLocaleEmulatorPath()
      return value ?? ''
    },
  })
}

export function useSetLocaleEmulatorPathMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (path: string) => window.api.settings.setLocaleEmulatorPath(path),
    onSuccess: (_data, path) => {
      queryClient.setQueryData(LOCALE_EMULATOR_PATH_QUERY_KEY, path)
    },
  })
}

// Named "language" (not "locale") in this file's exports to avoid reading
// like the unrelated Locale Emulator feature above - the underlying setting
// key is still 'locale' (the standard i18n term), see shared/types/ipc.ts's
// LocaleSchema.
export const LANGUAGE_QUERY_KEY = ['settings', 'locale'] as const

export function useLanguageQuery() {
  return useQuery({
    queryKey: LANGUAGE_QUERY_KEY,
    queryFn: async (): Promise<Locale> => {
      const value = await window.api.settings.getLocale()
      return value ?? DEFAULT_LOCALE
    },
  })
}

export function useSetLanguageMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (locale: Locale) => window.api.settings.setLocale(locale),
    onSuccess: (_data, locale) => {
      queryClient.setQueryData(LANGUAGE_QUERY_KEY, locale)
    },
  })
}

// Remembers the last folder picked on the Media page (see MediaPage.tsx) so
// switching tabs and coming back doesn't require picking it again. null
// means "never picked one yet". Also doubles as the second allowed root
// electron/main/mediaProtocol.ts checks - the Media page deliberately lets
// the user browse any folder, not just a registered library, so this
// persisted value is what makes media:// actually able to serve files from
// it (see that file's own comment).
export const MEDIA_FOLDER_QUERY_KEY = ['settings', 'media-folder'] as const

export function useMediaFolderQuery() {
  return useQuery({
    queryKey: MEDIA_FOLDER_QUERY_KEY,
    queryFn: async (): Promise<string | null> => {
      const value = await window.api.settings.getMediaFolder()
      return value ?? null
    },
  })
}

export function useSetMediaFolderMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (path: string) => window.api.settings.setMediaFolder(path),
    onSuccess: (_data, path) => {
      queryClient.setQueryData(MEDIA_FOLDER_QUERY_KEY, path)
    },
  })
}

export const EXPLORER_TREE_OPEN_QUERY_KEY = ['settings', 'explorer-tree-open'] as const

// Defaults to open (true) when nothing is persisted yet - matches the
// sidebar being a discoverable, expected-visible piece of Explorer's chrome
// rather than an opt-in feature a first-time user would have no reason to
// go looking for.
export function useExplorerTreeOpenQuery() {
  return useQuery({
    queryKey: EXPLORER_TREE_OPEN_QUERY_KEY,
    queryFn: async (): Promise<boolean> => {
      const value = await window.api.settings.getExplorerTreeOpen()
      return value ?? true
    },
  })
}

export function useSetExplorerTreeOpenMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (open: boolean) => window.api.settings.setExplorerTreeOpen(open),
    onSuccess: (_data, open) => {
      queryClient.setQueryData(EXPLORER_TREE_OPEN_QUERY_KEY, open)
    },
  })
}

export const EXPLORER_TREE_WIDTH_QUERY_KEY = ['settings', 'explorer-tree-width'] as const

export function useExplorerTreeWidthQuery() {
  return useQuery({
    queryKey: EXPLORER_TREE_WIDTH_QUERY_KEY,
    queryFn: async (): Promise<number> => {
      const value = await window.api.settings.getExplorerTreeWidth()
      return value === null ? EXPLORER_TREE_WIDTH_DEFAULT : clampExplorerTreeWidth(value)
    },
  })
}

export function useSetExplorerTreeWidthMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (width: number) =>
      window.api.settings.setExplorerTreeWidth(clampExplorerTreeWidth(width)),
    onSuccess: (_data, width) => {
      queryClient.setQueryData(EXPLORER_TREE_WIDTH_QUERY_KEY, clampExplorerTreeWidth(width))
    },
  })
}

export interface ExternalMetadataProviderSettings {
  enabled: boolean
  url: string
  apiKey: string
}

export const EXTERNAL_METADATA_PROVIDER_SETTINGS_QUERY_KEY = [
  'settings',
  'external-metadata-provider',
] as const

export function useExternalMetadataProviderSettings() {
  return useQuery<ExternalMetadataProviderSettings>({
    queryKey: EXTERNAL_METADATA_PROVIDER_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const [enabled, url, apiKey] = await Promise.all([
        window.api.settings.getExternalMetadataProviderEnabled(),
        window.api.settings.getExternalMetadataProviderUrl(),
        window.api.settings.getExternalMetadataProviderApiKey(),
      ])
      return { enabled, url, apiKey }
    },
  })
}

export function useSetExternalMetadataProviderSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (settings: Partial<ExternalMetadataProviderSettings>) => {
      await Promise.all([
        settings.enabled === undefined
          ? undefined
          : window.api.settings.setExternalMetadataProviderEnabled(settings.enabled),
        settings.url === undefined
          ? undefined
          : window.api.settings.setExternalMetadataProviderUrl(settings.url),
        settings.apiKey === undefined
          ? undefined
          : window.api.settings.setExternalMetadataProviderApiKey(settings.apiKey),
      ])
    },
    onSuccess: (_data, settings) => {
      queryClient.setQueryData<ExternalMetadataProviderSettings>(
        EXTERNAL_METADATA_PROVIDER_SETTINGS_QUERY_KEY,
        (current) => ({ enabled: false, url: '', apiKey: '', ...current, ...settings })
      )
    },
  })
}

export const MEDIA_SIDEBAR_OPEN_QUERY_KEY = ['settings', 'media-sidebar-open'] as const

// Defaults to closed (false) when nothing is persisted yet. Before commit
// 72d5d38 removed AppLayout.tsx's hasActiveTrack gate on <MediaSidebar>, a
// `true` default here was harmless - that gate suppressed rendering
// whenever nothing was playing, regardless of this setting. Now that
// <MediaSidebar> renders whenever this setting alone says open, a `true`
// default would put every fresh install / never-toggled-it user into a
// permanently-open 320px sidebar showing an empty queue on every page.
export function useMediaSidebarOpenQuery() {
  return useQuery({
    queryKey: MEDIA_SIDEBAR_OPEN_QUERY_KEY,
    queryFn: async (): Promise<boolean> => {
      const value = await window.api.settings.getMediaSidebarOpen()
      return value ?? false
    },
  })
}

export function useSetMediaSidebarOpenMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (open: boolean) => window.api.settings.setMediaSidebarOpen(open),
    onSuccess: (_data, open) => {
      queryClient.setQueryData(MEDIA_SIDEBAR_OPEN_QUERY_KEY, open)
    },
  })
}

export const MEDIA_SIDEBAR_WIDTH_QUERY_KEY = ['settings', 'media-sidebar-width'] as const

export function useMediaSidebarWidthQuery() {
  return useQuery({
    queryKey: MEDIA_SIDEBAR_WIDTH_QUERY_KEY,
    queryFn: async (): Promise<number> => {
      const value = await window.api.settings.getMediaSidebarWidth()
      return value === null ? MEDIA_SIDEBAR_WIDTH_DEFAULT : clampMediaSidebarWidth(value)
    },
  })
}

export function useSetMediaSidebarWidthMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (width: number) =>
      window.api.settings.setMediaSidebarWidth(clampMediaSidebarWidth(width)),
    onSuccess: (_data, width) => {
      queryClient.setQueryData(MEDIA_SIDEBAR_WIDTH_QUERY_KEY, clampMediaSidebarWidth(width))
    },
  })
}

export const MEDIA_VIEW_MODE_QUERY_KEY = ['settings', 'media-view-mode'] as const

// Defaults to 'list' when nothing is persisted yet - matches the existing
// list-only behavior for every install that predates this feature.
export function useMediaViewModeQuery() {
  return useQuery({
    queryKey: MEDIA_VIEW_MODE_QUERY_KEY,
    queryFn: async (): Promise<'list' | 'grid'> => {
      const value = await window.api.settings.getMediaViewMode()
      return value ?? 'list'
    },
  })
}

export function useSetMediaViewModeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (mode: 'list' | 'grid') => window.api.settings.setMediaViewMode(mode),
    onSuccess: (_data, mode) => {
      queryClient.setQueryData(MEDIA_VIEW_MODE_QUERY_KEY, mode)
    },
  })
}

export const MEDIA_VOLUME_QUERY_KEY = ['settings', 'media-volume'] as const

// Defaults to 1 (max) when nothing is persisted yet - matches the media
// player store's own initial volume, so a fresh install's first playback
// isn't silently quieter than before this setting existed.
export function useMediaVolumeQuery() {
  return useQuery({
    queryKey: MEDIA_VOLUME_QUERY_KEY,
    queryFn: async (): Promise<number> => {
      const value = await window.api.settings.getMediaVolume()
      return value === null ? 1 : Math.min(1, Math.max(0, value))
    },
  })
}

export function useSetMediaVolumeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (volume: number) => window.api.settings.setMediaVolume(volume),
    onSuccess: (_data, volume) => {
      queryClient.setQueryData(MEDIA_VOLUME_QUERY_KEY, volume)
    },
  })
}
