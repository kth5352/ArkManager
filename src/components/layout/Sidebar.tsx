import { Link } from '@tanstack/react-router'
import {
  FolderTree,
  Heart,
  History,
  LayoutGrid,
  List,
  ListMusic,
  Music,
  Rows3,
  Save,
  Search,
  Settings,
} from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { useTranslation } from '../../i18n/useTranslation'
import { Button } from '../ui/button'
import logoUrl from '../../../LOGO.png'
import type { TranslationKey } from '../../i18n/translations'
import {
  useMediaSidebarOpenQuery,
  useSetMediaSidebarOpenMutation,
} from '../../services/settingsService'

const navItems = [
  { to: '/', labelKey: 'nav.gallery', icon: LayoutGrid },
  { to: '/list', labelKey: 'nav.list', icon: List },
  { to: '/detail-list', labelKey: 'nav.detailList', icon: Rows3 },
  { to: '/explorer', labelKey: 'nav.explorer', icon: FolderTree },
  { to: '/game-search', labelKey: 'nav.gameSearch', icon: Search },
  { to: '/favorites', labelKey: 'nav.favorites', icon: Heart },
  { to: '/recently-played', labelKey: 'nav.recentlyPlayed', icon: History },
  { to: '/media', labelKey: 'nav.media', icon: Music },
  { to: '/saves', labelKey: 'nav.saves', icon: Save },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
] as const satisfies { to: string; labelKey: TranslationKey; icon: unknown }[]

export function Sidebar() {
  const { theme, toggleTheme } = useTheme()
  const { t } = useTranslation()
  // The main left-nav's own always-visible toggle for MediaSidebar - the
  // only other way to open it (the docked bar's queue button, see
  // MediaPlayerBar.tsx) only exists during active playback, so without this
  // a user who adds a track to a saved playlist via the context-menu action
  // with nothing playing has no way to reach playlist management at all.
  // Uses the same open/closed setting MediaSidebar's own close button
  // writes to (useMediaSidebarOpenQuery/useSetMediaSidebarOpenMutation),
  // toggling it rather than unconditionally opening, matching the
  // already-translated, previously-unused `media.sidebarToggle` label's
  // "toggle" framing.
  const { data: mediaSidebarOpenSetting, isLoading: mediaSidebarOpenLoading } =
    useMediaSidebarOpenQuery()
  const setMediaSidebarOpenMutation = useSetMediaSidebarOpenMutation()
  // Falls back to closed (false), matching useMediaSidebarOpenQuery's own
  // default and AppLayout.tsx's read of the same setting - see that
  // function's comment. isLoading is also checked below to disable the
  // toggle button itself while the query is still in its initial fetch, so
  // a click during that brief window can't write a value that then fights
  // with whatever the query resolves to moments later.
  const mediaSidebarOpen = mediaSidebarOpenSetting ?? false

  return (
    <aside className="flex w-56 flex-col border-r border-border bg-card p-4">
      <div className="mb-6 flex items-center gap-2 font-semibold">
        <img src={logoUrl} alt="" className="h-6 w-6 rounded" />
        Ark Manager
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map(({ to, labelKey, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === '/' }}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent [&.active]:bg-accent [&.active]:font-medium"
          >
            <Icon className="h-4 w-4" />
            {t(labelKey)}
          </Link>
        ))}
      </nav>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start gap-2"
        aria-label={t('media.sidebarToggle')}
        title={t('media.sidebarToggle')}
        disabled={mediaSidebarOpenLoading}
        onClick={() => setMediaSidebarOpenMutation.mutate(!mediaSidebarOpen)}
      >
        <ListMusic className="h-4 w-4" />
        {t('media.sidebarToggle')}
      </Button>
      <Button variant="ghost" size="sm" onClick={toggleTheme}>
        {theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}
      </Button>
    </aside>
  )
}
