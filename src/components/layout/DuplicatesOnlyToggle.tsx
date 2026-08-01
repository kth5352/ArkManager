import { Copy } from 'lucide-react'
import { Button } from '../ui/button'

interface DuplicatesOnlyToggleProps {
  value: boolean
  onChange: (value: boolean) => void
}

export function DuplicatesOnlyToggle({ value, onChange }: DuplicatesOnlyToggleProps) {
  return (
    <Button
      type="button"
      variant={value ? 'secondary' : 'ghost'}
      size="sm"
      title="중복만 보기"
      aria-label="중복만 보기"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className="h-7 gap-1 px-2 text-xs"
    >
      <Copy className="h-3.5 w-3.5" />
      중복만
    </Button>
  )
}
