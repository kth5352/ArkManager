import { Link } from '@tanstack/react-router'
import {
  FolderTree,
  Heart,
  History,
  LayoutGrid,
  List,
  Music,
  Rows3,
  Search,
  Settings,
} from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { useTranslation } from '../../i18n/useTranslation'
import { Button } from '../ui/button'
import logoUrl from '../../../LOGO.png'
import type { TranslationKey } from '../../i18n/translations'

const navItems = [
  { to: '/', labelKey: 'nav.gallery', icon: LayoutGrid },
  { to: '/list', labelKey: 'nav.list', icon: List },
  { to: '/detail-list', labelKey: 'nav.detailList', icon: Rows3 },
  { to: '/explorer', labelKey: 'nav.explorer', icon: FolderTree },
  { to: '/dlsite-search', labelKey: 'nav.dlsiteSearch', icon: Search },
  { to: '/favorites', labelKey: 'nav.favorites', icon: Heart },
  { to: '/recently-played', labelKey: 'nav.recentlyPlayed', icon: History },
  { to: '/media', labelKey: 'nav.media', icon: Music },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
] as const satisfies { to: string; labelKey: TranslationKey; icon: unknown }[]

export function Sidebar() {
  const { theme, toggleTheme } = useTheme()
  const { t } = useTranslation()

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
      <Button variant="ghost" size="sm" onClick={toggleTheme}>
        {theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}
      </Button>
    </aside>
  )
}
