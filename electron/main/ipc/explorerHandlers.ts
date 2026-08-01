import { dialog, ipcMain, shell } from 'electron'
import {
  DeleteEntriesRequestSchema,
  IPC_CHANNELS,
  MoveEntriesRequestSchema,
  RenameEntriesRequestSchema,
  SaveExplorerTabsRequestSchema,
  type MoveResultDto,
  type RenameResultDto,
} from '../../../shared/types/ipc'
import { normalizeLibraryPath } from '../../../shared/normalizeLibraryPath'
import { loadExplorerTabs, saveExplorerTabs } from '../database/explorerTabsRepository'
import { renameEntries } from '../fileOps/renameEntries'
import { deleteEntries } from '../fileOps/deleteEntries'
import { moveEntries } from '../fileOps/moveEntries'
import { rekeyPath } from '../database/gameUserDataRepository'
import { rekeyPathCodeOverride } from '../database/pathCodeOverridesRepository'
import { listLibraries } from '../database/librariesRepository'
import { isPathWithinAnyLibrary } from '../thumbnailProtocol'
import type { AppDatabase } from '../database/client'

const OUTSIDE_LIBRARY_ERROR = '허용되지 않은 경로입니다.'

function libraryRootsOf(db: AppDatabase): string[] {
  return listLibraries(db).map((library) => library.path)
}

// Every path a rename/delete/move targets must be an entry the app actually
// manages, i.e. under a currently registered library - these handlers are
// exposed to the renderer as plain functions taking arbitrary strings (not
// IDs resolved server-side), so without this a compromised or buggy
// renderer could rename/trash/move any file the OS user account can reach,
// not just entries inside a registered library. destDir for a move is
// intentionally NOT restricted here: it's meant to be freely chosen via the
// native OS folder picker (EXPLORER_PICK_MOVE_DESTINATION), and users
// legitimately move game folders out to arbitrary non-library locations
// (e.g. a backup drive).

function partitionByLibraryRoot<T>(
  items: T[],
  roots: string[],
  getPath: (item: T) => string
): { allowed: T[]; denied: T[] } {
  const allowed: T[] = []
  const denied: T[] = []
  for (const item of items) {
    ;(isPathWithinAnyLibrary(getPath(item), roots) ? allowed : denied).push(item)
  }
  return { allowed, denied }
}

// A manually-linked code (path_code_overrides) and a code-less entry's
// favorite/rating/memo/playtime/customCoverPath (game_user_data, path-keyed)
// are both keyed by the exact normalized path they were recorded at - any
// operation that changes an entry's path (move OR rename) must carry both
// over to the new path, or they'd silently orphan at a path nothing lives at
// anymore. A coded entry needs neither: its game_user_data key is the code
// itself, unaffected by where the file sits.
function rekeyPathsForResults(db: AppDatabase, results: (RenameResultDto | MoveResultDto)[]): void {
  for (const result of results) {
    if (!result.success || !result.newPath) continue
    const oldKey = normalizeLibraryPath(result.path)
    const newKey = normalizeLibraryPath(result.newPath)
    if (oldKey === newKey) continue
    rekeyPathCodeOverride(db, oldKey, newKey)
    rekeyPath(db, oldKey, newKey)
  }
}

export function registerExplorerHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.EXPLORER_LOAD_TABS, () => {
    return loadExplorerTabs(db)
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_SAVE_TABS, (_event, payload: unknown) => {
    const { tabs } = SaveExplorerTabsRequestSchema.parse(payload)
    saveExplorerTabs(db, tabs)
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_RENAME_ENTRIES, async (_event, payload: unknown) => {
    const { renames } = RenameEntriesRequestSchema.parse(payload)
    const { allowed, denied } = partitionByLibraryRoot(renames, libraryRootsOf(db), (r) => r.path)
    const renameResults = await renameEntries(allowed)
    const results: RenameResultDto[] = [
      ...renameResults,
      ...denied.map((r) => ({
        path: r.path,
        success: false as const,
        error: OUTSIDE_LIBRARY_ERROR,
      })),
    ]
    rekeyPathsForResults(db, results)
    return results
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_DELETE_ENTRIES, async (_event, payload: unknown) => {
    const { paths } = DeleteEntriesRequestSchema.parse(payload)
    const { allowed, denied } = partitionByLibraryRoot(paths, libraryRootsOf(db), (p) => p)
    const deleteResults = await deleteEntries(allowed, shell.trashItem)
    return [
      ...deleteResults,
      ...denied.map((path) => ({ path, success: false as const, error: OUTSIDE_LIBRARY_ERROR })),
    ]
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_PICK_MOVE_DESTINATION, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(
    IPC_CHANNELS.EXPLORER_MOVE_ENTRIES,
    async (_event, payload: unknown): Promise<MoveResultDto[]> => {
      const { paths, destDir } = MoveEntriesRequestSchema.parse(payload)
      const { allowed, denied } = partitionByLibraryRoot(paths, libraryRootsOf(db), (p) => p)
      const moveResults = await moveEntries(allowed, destDir)
      const results: MoveResultDto[] = [
        ...moveResults,
        ...denied.map((path) => ({ path, success: false as const, error: OUTSIDE_LIBRARY_ERROR })),
      ]
      rekeyPathsForResults(db, results)
      return results
    }
  )
}
