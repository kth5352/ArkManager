import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { seedThemeQueryData } from './services/settingsService'
import './globals.css'

// Apply the persisted theme synchronously, before the first paint, so the
// app never flashes the wrong theme while the async settings query (used
// for reactivity/toggling after boot, see useTheme.ts) resolves. Mirrors
// useTheme.ts's default-to-'dark' fallback for the "no persisted value yet"
// case (fresh install).
const persistedTheme = window.api.settings.getThemeSync()
const initialTheme = persistedTheme ?? 'dark'
document.documentElement.classList.toggle('dark', initialTheme === 'dark')

const queryClient = new QueryClient()
// Seed the query cache so useThemeQuery()'s first render already returns the
// real persisted value instead of a hardcoded fallback - otherwise
// useTheme.ts's effect would briefly re-apply a mismatched default theme
// before the async fetch resolves, reintroducing the flash one tick later.
seedThemeQueryData(queryClient, initialTheme)

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
)
