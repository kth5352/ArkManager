import { shell, ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  OpenPathRequestSchema,
  OpenExternalRequestSchema,
  ShowItemInFolderRequestSchema,
} from '../../../shared/types/ipc'
import { buildExternalUrl } from '../shell/buildExternalUrl'
import { listLibraries } from '../database/librariesRepository'
import { isPathWithinAnyLibrary } from '../thumbnailProtocol'
import type { AppDatabase } from '../database/client'

function libraryRootsOf(db: AppDatabase): string[] {
  return listLibraries(db).map((library) => library.path)
}

export function registerShellHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, (_event, payload: unknown) => {
    const { code } = OpenExternalRequestSchema.parse(payload)
    const url = buildExternalUrl(code)
    return shell.openExternal(url)
  })

  ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, (_event, payload: unknown) => {
    const { path } = ShowItemInFolderRequestSchema.parse(payload)
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
