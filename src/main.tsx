import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { PlayerWindowPage } from './pages/PlayerWindow/PlayerWindowPage'
import { readPersistedThemeSync, seedThemeQueryData } from './services/settingsService'
import './globals.css'

// Apply the persisted theme synchronously, before the first paint, so the
// app never flashes the wrong theme while the async settings query (used
// for reactivity/toggling after boot, see useTheme.ts) resolves. Mirrors
// useTheme.ts's default-to-'dark' fallback for the "no persisted value yet"
// case (fresh install).
const persistedTheme = readPersistedThemeSync()
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

// The detached media player (see electron/main/ipc/mediaWindowHandlers.ts)
// loads this exact same renderer bundle at a distinguishing hash - routed
// here, before the TanStack Router/AppLayout/Sidebar ever get involved,
// since that window has none of the app's normal chrome, just the player.
// Going through the router instead would double-mount MediaPlayerHost
// (AppLayout's own) alongside PlayerWindowPage's, both trying to host
// playback in the same window at once.
const isPlayerWindow = window.location.hash.startsWith('#/player-window')

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {isPlayerWindow ? <PlayerWindowPage /> : <RouterProvider router={router} />}
    </QueryClientProvider>
  </StrictMode>
)
