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
import type { AppDatabase } from '../database/client'

// A manually-linked code (path_code_overrides) and a code-less entry's
// favorite/rating/memo/playtime/customCoverPath (game_user_data, path-keyed)
// are both keyed by the exact normalized path they were recorded at - any
// operation that changes an entry's path (move OR rename) must carry both
// over to the new path, or they'd silently orphan at a path nothing lives at
// anymore. A coded entry needs neither: its game_user_data key is the code
// itself, unaffected by where the file sits.
function rekeyPathsForResults(
  db: AppDatabase,
  results: (RenameResultDto | MoveResultDto)[]
): void {
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
    const results = await renameEntries(renames)
    rekeyPathsForResults(db, results)
    return results
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_DELETE_ENTRIES, (_event, payload: unknown) => {
    const { paths } = DeleteEntriesRequestSchema.parse(payload)
    return deleteEntries(paths, shell.trashItem)
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
      const results = await moveEntries(paths, destDir)
      rekeyPathsForResults(db, results)
      return results
    }
  )
}
