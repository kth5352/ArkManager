import { useEffect } from 'react'
import { useSetThemeMutation, useThemeQuery } from '../services/settingsService'
import type { Theme } from '../../shared/types/ipc'

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const { data: theme = 'dark' } = useThemeQuery()
  const setThemeMutation = useSetThemeMutation()

  // Safe to call from multiple components - this toggle is idempotent, so redundant calls are no-ops.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggleTheme = (): void => {
    setThemeMutation.mutate(theme === 'dark' ? 'light' : 'dark')
  }

  return { theme, toggleTheme }
}
