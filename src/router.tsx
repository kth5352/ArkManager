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
import { DetailListPage } from './pages/DetailList/DetailListPage'
import { ExplorerPage } from './pages/Explorer/ExplorerPage'
import { DetailPage } from './pages/Detail/DetailPage'
import { SettingsPage } from './pages/Settings/SettingsPage'
import { GameSearchPage } from './pages/GameSearch/GameSearchPage'
import { FavoritesPage } from './pages/Favorites/FavoritesPage'
import { RecentlyPlayedPage } from './pages/RecentlyPlayed/RecentlyPlayedPage'
import { MediaPage } from './pages/Media/MediaPage'
import { SavesPage } from './pages/Saves/SavesPage'

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
const detailListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/detail-list',
  component: DetailListPage,
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
const gameSearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/game-search',
  component: GameSearchPage,
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
const mediaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/media',
  component: MediaPage,
})
const savesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/saves',
  component: SavesPage,
})

const routeTree = rootRoute.addChildren([
  galleryRoute,
  listRoute,
  detailListRoute,
  explorerRoute,
  detailRoute,
  gameSearchRoute,
  favoritesRoute,
  recentlyPlayedRoute,
  mediaRoute,
  savesRoute,
  settingsRoute,
])

export const router = createRouter({ routeTree, history: createHashHistory() })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
