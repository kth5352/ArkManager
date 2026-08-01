import { useSelectionStore } from '../../stores/selectionStore'

interface SelectionCheckboxProps {
  path: string
  className?: string
}

export function SelectionCheckbox({ path, className }: SelectionCheckboxProps) {
  const isSelected = useSelectionStore((s) => s.selectedPaths.has(path))
  const toggle = useSelectionStore((s) => s.toggle)

  return (
    <input
      type="checkbox"
      aria-label="선택"
      checked={isSelected}
      onClick={(e) => e.stopPropagation()}
      onChange={() => toggle(path)}
      className={className}
    />
  )
}
