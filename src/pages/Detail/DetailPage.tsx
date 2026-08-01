import { LibraryBig } from 'lucide-react'
import { useTranslation } from '../../i18n/useTranslation'

export function DetailPage() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <LibraryBig className="h-10 w-10" />
      <p>{t('detail.placeholder')}</p>
    </div>
  )
}
