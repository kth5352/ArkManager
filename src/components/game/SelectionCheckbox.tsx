import { useSelectionStore } from '../../stores/selectionStore'

interface SelectionCheckboxProps {
  path: string
  className?: string
}

export function SelectionCheckbox({ path, className }: SelectionCheckboxProps) {
  const isActive = useSelectionStore((s) => s.isActive)
  const isSelected = useSelectionStore((s) => s.selectedPaths.has(path))
  const toggle = useSelectionStore((s) => s.toggle)

  // Hidden until selection mode is entered (long-press or the toolbar's
  // "선택" button) - not rendered at all, rather than hidden via CSS, so it
  // never intercepts clicks/space-bar focus on a card in the normal case.
  if (!isActive) return null

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
