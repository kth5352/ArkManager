import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Slider } from '../ui/slider'
import type { SortDirection, SortField } from '../../../shared/types/ipc'

interface PageToolbarProps {
  sortField: SortField
  sortDirection: SortDirection
  onSortChange: (field: SortField, direction: SortDirection) => void
  zoom?: number
  onZoomChange?: (zoom: number) => void
}

const SORT_FIELD_LABELS: Record<SortField, string> = {
  name: '이름',
  mtime: '변경시간',
  extension: '확장자',
}

export function PageToolbar({
  sortField,
  sortDirection,
  onSortChange,
  zoom,
  onZoomChange,
}: PageToolbarProps) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <Select
        value={sortField}
        onValueChange={(value) => onSortChange(value as SortField, sortDirection)}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">{SORT_FIELD_LABELS.name}</SelectItem>
          <SelectItem value="mtime">{SORT_FIELD_LABELS.mtime}</SelectItem>
          <SelectItem value="extension">{SORT_FIELD_LABELS.extension}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        aria-label="정렬 방향 전환"
        onClick={() => onSortChange(sortField, sortDirection === 'asc' ? 'desc' : 'asc')}
      >
        {sortDirection === 'asc' ? (
          <ArrowUpAZ className="h-4 w-4" />
        ) : (
          <ArrowDownAZ className="h-4 w-4" />
        )}
      </Button>
      {zoom !== undefined && onZoomChange && (
        <Slider
          className="ml-auto w-40"
          value={[zoom]}
          min={0.6}
          max={1.8}
          step={0.05}
          onValueChange={([value]) => onZoomChange(value)}
        />
      )}
    </div>
  )
}
