import type { TranslationKey } from '../../i18n/translations'

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string

// Takes the same t() useTranslation() returns, rather than a dict directly -
// every other caller in the app already has t() in scope (from its own
// useTranslation() call), so this matches that shape instead of asking
// callers to reach into translations.ts themselves.
export function formatPlaytime(totalPlaytimeMs: number, t: Translate): string {
  const totalMinutes = Math.floor(totalPlaytimeMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return t('time.minutes', { minutes })
  if (minutes === 0) return t('time.hours', { hours })
  return t('time.hoursMinutes', { hours, minutes })
}
