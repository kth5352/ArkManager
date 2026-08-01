import { Archive, FolderOpen, Layers } from 'lucide-react'
import { Button } from '../ui/button'
import type { FileKindFilter } from '../../lib/filterEntries'

interface FileKindFilterToggleProps {
  value: FileKindFilter
  onChange: (value: FileKindFilter) => void
}

const OPTIONS: { value: FileKindFilter; label: string; icon: typeof Layers }[] = [
  { value: 'all', label: '전체', icon: Layers },
  { value: 'archive-only', label: '압축파일만', icon: Archive },
  { value: 'no-archive', label: '압축파일 제외', icon: FolderOpen },
]

export function FileKindFilterToggle({ value, onChange }: FileKindFilterToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {OPTIONS.map(({ value: optionValue, label, icon: Icon }) => (
        <Button
          key={optionValue}
          type="button"
          variant={value === optionValue ? 'secondary' : 'ghost'}
          size="sm"
          title={label}
          aria-label={label}
          onClick={() => onChange(optionValue)}
          className="h-7 px-2"
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}
    </div>
  )
}
