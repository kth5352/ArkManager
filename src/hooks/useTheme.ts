import { useEffect } from 'react'
import { useSetThemeMutation, useThemeQuery } from '../services/settingsService'
import type { Theme } from '../../shared/types/ipc'

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const { data: theme = 'dark' } = useThemeQuery()
  const setThemeMutation = useSetThemeMutation()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggleTheme = (): void => {
    setThemeMutation.mutate(theme === 'dark' ? 'light' : 'dark')
  }

  return { theme, toggleTheme }
}
