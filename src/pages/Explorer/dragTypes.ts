import type { ScannedEntry } from '../../../shared/types/scanner'

// Tagged onto every draggable/droppable's `data` option so the single
// shared DndContext's onDragEnd (ExplorerPage.tsx) can tell what kind of
// drag just happened - a tab being reordered vs. an entry being moved -
// and droppables can tell what destination path a drop resolves to.
export type ExplorerDragData =
  { type: 'entry'; entry: ScannedEntry } | { type: 'tab'; path: string }

export type ExplorerDropData =
  | { type: 'folder-entry'; path: string }
  | { type: 'breadcrumb'; path: string }
  | { type: 'tab'; path: string }
