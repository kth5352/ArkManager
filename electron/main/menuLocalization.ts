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
  refreshAllMetadata: string
  // Contains a literal "{count}" placeholder - no interpolation engine
  // exists in this main-process-only localization table (unlike the
  // renderer's own i18n/useTranslation, which does support {param}
  // substitution), so the caller (buildApplicationMenu's click handler)
  // does a plain string .replace('{count}', ...) itself.
  refreshAllConfirmMessage: string
  refreshAllConfirmCancelButton: string
  refreshAllConfirmConfirmButton: string
  refreshAllEmptyMessage: string
  refreshAllEmptyOkButton: string
}

const MENU_LABELS: Record<Locale, MenuLabels> = {
  ko: {
    reload: '새로고침',
    forceReload: '강제 새로고침',
    manageExcludedItems: '제외 항목 관리...',
    reloadConfirmMessage: '미디어가 재생 중입니다. 새로고침하면 재생이 중단됩니다. 계속하시겠습니까?',
    reloadConfirmCancelButton: '취소',
    reloadConfirmConfirmButton: '새로고침',
    refreshAllMetadata: '전체 메타데이터 새로고침',
    refreshAllConfirmMessage:
      '이미 크롤링을 시도한 항목 {count}개를 전부 다시 크롤링합니다(가져오지 못했던 항목 포함). 초당 1건 속도로 진행되어 라이브러리가 크면 시간이 다소 걸릴 수 있습니다. 계속하시겠습니까?',
    refreshAllConfirmCancelButton: '취소',
    refreshAllConfirmConfirmButton: '새로고침',
    refreshAllEmptyMessage: '새로고침할 메타데이터가 없습니다.',
    refreshAllEmptyOkButton: '확인',
  },
  ja: {
    reload: '再読み込み',
    forceReload: '強制再読み込み',
    manageExcludedItems: '除外項目の管理...',
    reloadConfirmMessage: 'メディアを再生中です。再読み込みすると再生が中断されます。続行しますか?',
    reloadConfirmCancelButton: 'キャンセル',
    reloadConfirmConfirmButton: '再読み込み',
    refreshAllMetadata: 'すべてのメタデータを更新',
    refreshAllConfirmMessage:
      'すでにクロールを試みた{count}件（取得できなかった作品も含む）をすべて再クロールします。1秒に1件のペースで進むため、ライブラリが大きいと時間がかかる場合があります。続行しますか?',
    refreshAllConfirmCancelButton: 'キャンセル',
    refreshAllConfirmConfirmButton: '更新',
    refreshAllEmptyMessage: '更新するメタデータがありません。',
    refreshAllEmptyOkButton: 'OK',
  },
  en: {
    reload: 'Reload',
    forceReload: 'Force Reload',
    manageExcludedItems: 'Manage Excluded Items...',
    reloadConfirmMessage: 'Media is currently playing. Reloading will stop playback. Continue?',
    reloadConfirmCancelButton: 'Cancel',
    reloadConfirmConfirmButton: 'Reload',
    refreshAllMetadata: 'Refresh All Metadata',
    refreshAllConfirmMessage:
      'This will re-crawl all {count} previously-attempted items (including ones that failed to fetch before). It runs at 1 per second, so a large library may take a while. Continue?',
    refreshAllConfirmCancelButton: 'Cancel',
    refreshAllConfirmConfirmButton: 'Refresh',
    refreshAllEmptyMessage: 'There is no metadata to refresh yet.',
    refreshAllEmptyOkButton: 'OK',
  },
}

export function getMenuLabels(locale: string | undefined): MenuLabels {
  const parsed = LocaleSchema.safeParse(locale)
  return MENU_LABELS[parsed.success ? parsed.data : 'ko']
}
