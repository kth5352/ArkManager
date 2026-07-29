import { Link } from '@tanstack/react-router'
import {
  FolderTree,
  Heart,
  History,
  LayoutGrid,
  LibraryBig,
  List,
  Rows3,
  Search,
  Settings,
} from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { Button } from '../ui/button'

const navItems = [
  { to: '/', label: 'Gallery', icon: LayoutGrid },
  { to: '/list', label: 'List', icon: List },
  { to: '/detail-list', label: 'DetailList', icon: Rows3 },
  { to: '/explorer', label: 'Explorer', icon: FolderTree },
  { to: '/dlsite-search', label: 'DLsite 검색', icon: Search },
  { to: '/favorites', label: '즐겨찾기', icon: Heart },
  { to: '/recently-played', label: '최근 플레이', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export function Sidebar() {
  const { theme, toggleTheme } = useTheme()

  return (
    <aside className="flex w-56 flex-col border-r border-border bg-card p-4">
      <div className="mb-6 flex items-center gap-2 font-semibold">
        <LibraryBig className="h-5 w-5" />
        DLibrary
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === '/' }}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent [&.active]:bg-accent [&.active]:font-medium"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <Button variant="ghost" size="sm" onClick={toggleTheme}>
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </Button>
    </aside>
  )
}
