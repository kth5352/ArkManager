import { resolve } from 'node:path'
import { normalizeLibraryPath } from '../../../shared/normalizeLibraryPath'

// One-shot "the user just chose this in a native picker" slots, shared
// between the handler that opens a picker and the (different) handler that
// later persists the choice - e.g. launch:pick-locale-emulator-path opens the
// dialog but settings:set stores the value. Same trust pattern as
// lastPickedSaveFolderPath (saveHandlers.ts): a renderer can only persist a
// path the main process itself just got back from the OS dialog.
export type PickedPathKind = 'locale-emulator' | 'folder'

const slots = new Map<PickedPathKind, string>()

function comparable(path: string): string {
  return normalizeLibraryPath(resolve(path)).replace(/\\/g, '/')
}

export function rememberPickedPath(kind: PickedPathKind, path: string): void {
  slots.set(kind, path)
}

/** True (and clears the slot) when `path` is the one most recently picked for `kind`. */
export function consumePickedPath(kind: PickedPathKind, path: string): boolean {
  const picked = slots.get(kind)
  if (picked === undefined || comparable(picked) !== comparable(path)) return false
  slots.delete(kind)
  return true
}

export function resetPickedPathsForTests(): void {
  slots.clear()
}
