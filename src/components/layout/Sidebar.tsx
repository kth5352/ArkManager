import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import {
  FolderTree,
  Heart,
  History,
  LayoutGrid,
  List,
  Music,
  Rows3,
  Save,
  Search,
  Settings,
} from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { useTranslation } from '../../i18n/useTranslation'
import { Button } from '../ui/button'
import { UI_MOTION } from '../../lib/motion'
import logoUrl from '../../../LOGO.png'
import type { TranslationKey } from '../../i18n/translations'

interface NavItem {
  to: string
  labelKey: TranslationKey
  icon: typeof LayoutGrid
}

// U3 (UI renewal plan): the same 10 routes as before, now shown in 3 labeled
// groups instead of one flat list - library (browsing/finding games),
// activity (favorites/recently played/saves - things done WITH games),
// media (the one non-game-library feature). Settings and the theme toggle
// stay outside any group, pinned to the bottom, same as before.
const navGroups: { labelKey: TranslationKey; items: NavItem[] }[] = [
  {
    labelKey: 'nav.groupLibrary',
    items: [
      { to: '/', labelKey: 'nav.gallery', icon: LayoutGrid },
      { to: '/list', labelKey: 'nav.list', icon: List },
      { to: '/detail-list', labelKey: 'nav.detailList', icon: Rows3 },
      { to: '/explorer', labelKey: 'nav.explorer', icon: FolderTree },
      { to: '/game-search', labelKey: 'nav.gameSearch', icon: Search },
    ],
  },
  {
    labelKey: 'nav.groupActivity',
    items: [
      { to: '/favorites', labelKey: 'nav.favorites', icon: Heart },
      { to: '/recently-played', labelKey: 'nav.recentlyPlayed', icon: History },
      { to: '/saves', labelKey: 'nav.saves', icon: Save },
    ],
  },
  {
    labelKey: 'nav.groupMedia',
    items: [{ to: '/media', labelKey: 'nav.media', icon: Music }],
  },
]

export function Sidebar() {
  const { theme, toggleTheme } = useTheme()
  const { t } = useTranslation()

  return (
    // shrink-0: never gives up width to `main` under flex pressure - a
    // narrow window should shrink the content area, not this rail. min-h-0
    // on the flex column lets the nav's own overflow-y-auto below actually
    // engage instead of the whole sidebar (brand row + settings included)
    // trying to scroll together.
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card p-4">
      <div className="mb-6 flex shrink-0 items-center gap-2 font-semibold">
        <img src={logoUrl} alt="" className="h-6 w-6 rounded" />
        Ark Manager
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.labelKey} className="flex flex-col gap-1">
            <p className="px-3 text-xs font-semibold text-muted-foreground">
              {t(group.labelKey)}
            </p>
            {group.items.map(({ to, labelKey, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === '/' }}
                className="relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&:not(.active)]:hover:bg-accent"
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="app-sidebar-selection"
                        className="absolute inset-0 rounded-lg bg-primary/10"
                        transition={{ duration: UI_MOTION.selection, ease: UI_MOTION.ease }}
                      />
                    )}
                    <Icon className="relative z-10 h-4 w-4" />
                    <span className="relative z-10">{t(labelKey)}</span>
                  </>
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-4 flex shrink-0 flex-col gap-1 border-t border-border pt-4">
        <Link
          to="/settings"
          className="relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&:not(.active)]:hover:bg-accent"
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="app-sidebar-selection"
                  className="absolute inset-0 rounded-lg bg-primary/10"
                  transition={{ duration: UI_MOTION.selection, ease: UI_MOTION.ease }}
                />
              )}
              <Settings className="relative z-10 h-4 w-4" />
              <span className="relative z-10">{t('nav.settings')}</span>
            </>
          )}
        </Link>
        <Button variant="ghost" size="sm" onClick={toggleTheme}>
          {theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}
        </Button>
      </div>
    </aside>
  )
}
