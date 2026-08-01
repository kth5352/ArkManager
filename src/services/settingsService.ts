import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Theme } from '../../shared/types/ipc'
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from '../lib/clampSidebarWidth'

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
