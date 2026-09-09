import { shell, ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  OpenPathRequestSchema,
  OpenExternalRequestSchema,
  ShowItemInFolderRequestSchema,
} from '../../../shared/types/ipc'
import { buildExternalUrl } from '../shell/buildExternalUrl'
import { listLibraries } from '../database/librariesRepository'
import { listGamesWithSavePath } from '../database/gameUserDataRepository'
import { isPathExactlyTrusted, isPathWithinAnyLibrary } from '../thumbnailProtocol'
import type { AppDatabase } from '../database/client'

function libraryRootsOf(db: AppDatabase): string[] {
  return listLibraries(db).map((library) => library.path)
}

// Save folders are frequently outside every registered library (AppData,
// Documents, a cloud-sync folder, etc.) - listGamesWithSavePath is the same
// source SavesPage.tsx itself reads from, so this trusts exactly the save
// paths the user has already explicitly configured, not an arbitrary
// renderer-supplied path.
function savePathsOf(db: AppDatabase): string[] {
  return listGamesWithSavePath(db).map((entry) => entry.savePath)
}

export function registerShellHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, (_event, payload: unknown) => {
    const { code } = OpenExternalRequestSchema.parse(payload)
    const url = buildExternalUrl(code)
    return shell.openExternal(url)
  })

  ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, (_event, payload: unknown) => {
    const { path } = ShowItemInFolderRequestSchema.parse(payload)
    // Previously unchecked, unlike SHELL_OPEN_PATH just below - a
    // compromised or buggy renderer could reveal an arbitrary filesystem
    // path in the OS file explorer (e.g. a sensitive file elsewhere in the
    // user's profile), which showItemInFolder doesn't need to actually
    // execute anything to do. Same isPathWithinAnyLibrary check as
    // SHELL_OPEN_PATH, plus isPathExactlyTrusted against configured save
    // paths - this handler is the one "open folder" callers actually use
    // for save locations (SaveDataSection.tsx), which are commonly outside
    // every registered library.
    if (
      !isPathWithinAnyLibrary(path, libraryRootsOf(db)) &&
      !isPathExactlyTrusted(path, savePathsOf(db))
    ) {
      throw new Error('Path is outside registered libraries.')
    }
    shell.showItemInFolder(path)
  })

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_PATH, async (_event, payload: unknown) => {
    const { path } = OpenPathRequestSchema.parse(payload)
    if (!isPathWithinAnyLibrary(path, libraryRootsOf(db))) {
      throw new Error('Path is outside registered libraries.')
    }
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })
}
