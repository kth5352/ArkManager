import { Archive, FolderOpen, Layers } from 'lucide-react'
import { Button } from '../ui/button'
import { useTranslation } from '../../i18n/useTranslation'
import type { TranslationKey } from '../../i18n/translations'
import type { FileKindFilter } from '../../lib/filterEntries'

interface FileKindFilterToggleProps {
  value: FileKindFilter
  onChange: (value: FileKindFilter) => void
}

const OPTIONS: { value: FileKindFilter; labelKey: TranslationKey; icon: typeof Layers }[] = [
  { value: 'all', labelKey: 'fileKind.all', icon: Layers },
  { value: 'archive-only', labelKey: 'fileKind.archiveOnly', icon: Archive },
  { value: 'no-archive', labelKey: 'fileKind.noArchive', icon: FolderOpen },
]

export function FileKindFilterToggle({ value, onChange }: FileKindFilterToggleProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {OPTIONS.map(({ value: optionValue, labelKey, icon: Icon }) => (
        <Button
          key={optionValue}
          type="button"
          variant={value === optionValue ? 'secondary' : 'ghost'}
          size="sm"
          title={t(labelKey)}
          aria-label={t(labelKey)}
          onClick={() => onChange(optionValue)}
          className="h-7 px-2"
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}
    </div>
  )
}
