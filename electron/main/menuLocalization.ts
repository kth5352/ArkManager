import { LocaleSchema, type Locale } from '../../shared/types/ipc'

// Same pattern as windowCloseBehavior.ts's WINDOW_CLOSE_PROMPTS - this
// app's own custom application-menu items (and the reload-confirm dialog
// they can trigger) were hardcoded Korean regardless of the in-app language
// setting, a real gap a live user found (changing Settings > language never
// touched the native menu bar at all). File/Edit's own top-level titles and
// View/Window's non-custom items intentionally stay Electron's own
// role-derived defaults (see buildApplicationMenu's comment in index.ts for
// why) - only the items this app adds custom behavior to are localized here.
export interface MenuLabels {
  reload: string
  forceReload: string
  manageExcludedItems: string
  reloadConfirmMessage: string
  reloadConfirmCancelButton: string
  reloadConfirmConfirmButton: string
}

const MENU_LABELS: Record<Locale, MenuLabels> = {
  ko: {
    reload: '새로고침',
    forceReload: '강제 새로고침',
    manageExcludedItems: '제외 항목 관리...',
    reloadConfirmMessage: '미디어가 재생 중입니다. 새로고침하면 재생이 중단됩니다. 계속하시겠습니까?',
    reloadConfirmCancelButton: '취소',
    reloadConfirmConfirmButton: '새로고침',
  },
  ja: {
    reload: '再読み込み',
    forceReload: '強制再読み込み',
    manageExcludedItems: '除外項目の管理...',
    reloadConfirmMessage: 'メディアを再生中です。再読み込みすると再生が中断されます。続行しますか?',
    reloadConfirmCancelButton: 'キャンセル',
    reloadConfirmConfirmButton: '再読み込み',
  },
  en: {
    reload: 'Reload',
    forceReload: 'Force Reload',
    manageExcludedItems: 'Manage Excluded Items...',
    reloadConfirmMessage: 'Media is currently playing. Reloading will stop playback. Continue?',
    reloadConfirmCancelButton: 'Cancel',
    reloadConfirmConfirmButton: 'Reload',
  },
}

export function getMenuLabels(locale: string | undefined): MenuLabels {
  const parsed = LocaleSchema.safeParse(locale)
  return MENU_LABELS[parsed.success ? parsed.data : 'ko']
}
