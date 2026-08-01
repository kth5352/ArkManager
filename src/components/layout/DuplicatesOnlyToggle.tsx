import { Copy } from 'lucide-react'
import { Button } from '../ui/button'
import { useTranslation } from '../../i18n/useTranslation'

interface DuplicatesOnlyToggleProps {
  value: boolean
  onChange: (value: boolean) => void
}

export function DuplicatesOnlyToggle({ value, onChange }: DuplicatesOnlyToggleProps) {
  const { t } = useTranslation()

  return (
    <Button
      type="button"
      variant={value ? 'secondary' : 'ghost'}
      size="sm"
      title={t('duplicatesOnly.tooltip')}
      aria-label={t('duplicatesOnly.tooltip')}
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className="h-7 gap-1 px-2 text-xs"
    >
      <Copy className="h-3.5 w-3.5" />
      {t('duplicatesOnly.label')}
    </Button>
  )
}
