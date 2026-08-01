import { useLanguageQuery } from '../services/settingsService'
import { translations, translate, DEFAULT_LOCALE, type TranslationKey } from './translations'

// t(key) always resolves - a key missing from the current locale's dict
// (shouldn't happen once a key is added, but guards a partial edit) falls
// back to the Korean original rather than rendering the raw key string.
// params does a plain {name} substitution, e.g. t('scan.progress', {count})
// against a dict entry like '{count}개 항목 스캔 중...' - simple on purpose,
// this app has no strings complex enough to need real ICU plural/gender
// rules.
export function useTranslation(): {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  locale: string
} {
  const { data: locale = DEFAULT_LOCALE } = useLanguageQuery()
  const dict = translations[locale]

  return {
    t: (key, params) => translate(dict, key, params),
    locale,
  }
}
