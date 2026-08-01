import { useLanguageQuery } from '../services/settingsService'
import { translations, DEFAULT_LOCALE, type TranslationKey } from './translations'

// t(key) always resolves - a key missing from the current locale's dict
// (shouldn't happen once a key is added, but guards a partial edit) falls
// back to the Korean original rather than rendering the raw key string.
export function useTranslation(): { t: (key: TranslationKey) => string; locale: string } {
  const { data: locale = DEFAULT_LOCALE } = useLanguageQuery()
  const dict = translations[locale]

  const t = (key: TranslationKey): string => dict[key] ?? translations[DEFAULT_LOCALE][key] ?? key

  return { t, locale }
}
