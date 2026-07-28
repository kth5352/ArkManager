import {
  Outlet,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { AppLayout } from './components/layout/AppLayout'
import { GalleryPage } from './pages/Gallery/GalleryPage'
import { ListPage } from './pages/List/ListPage'
import { ExplorerPage } from './pages/Explorer/ExplorerPage'
import { DetailPage } from './pages/Detail/DetailPage'
import { SettingsPage } from './pages/Settings/SettingsPage'
import { DlsiteSearchPage } from './pages/DlsiteSearch/DlsiteSearchPage'
import { FavoritesPage } from './pages/Favorites/FavoritesPage'
import { RecentlyPlayedPage } from './pages/RecentlyPlayed/RecentlyPlayedPage'

const rootRoute = createRootRoute({
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
})

const galleryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: GalleryPage,
})
const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/list',
  component: ListPage,
})
const explorerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explorer',
  component: ExplorerPage,
})
const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/detail',
  component: DetailPage,
})
const dlsiteSearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dlsite-search',
  component: DlsiteSearchPage,
})
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})
const favoritesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/favorites',
  component: FavoritesPage,
})
const recentlyPlayedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recently-played',
  component: RecentlyPlayedPage,
})

const routeTree = rootRoute.addChildren([
  galleryRoute,
  listRoute,
  explorerRoute,
  detailRoute,
  dlsiteSearchRoute,
  favoritesRoute,
  recentlyPlayedRoute,
  settingsRoute,
])

export const router = createRouter({ routeTree, history: createHashHistory() })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
