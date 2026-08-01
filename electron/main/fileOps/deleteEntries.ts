import type { DeleteResultDto } from '../../../shared/types/ipc'

// trashItem is required (not defaulted to Electron's shell.trashItem here)
// so this module has no 'electron' import of its own - the IPC handler
// (deleteEntriesHandlers.ts) wires the real shell.trashItem at the call
// site; this file stays plain Node and unit-testable without a running
// Electron process.
export async function deleteEntries(
  paths: string[],
  trashItem: (path: string) => Promise<void>
): Promise<DeleteResultDto[]> {
  const results: DeleteResultDto[] = []

  for (const path of paths) {
    try {
      await trashItem(path)
      results.push({ path, success: true })
    } catch (error) {
      results.push({
        path,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}
