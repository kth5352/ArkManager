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
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([
  galleryRoute,
  listRoute,
  explorerRoute,
  detailRoute,
  settingsRoute,
])

export const router = createRouter({ routeTree, history: createHashHistory() })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
