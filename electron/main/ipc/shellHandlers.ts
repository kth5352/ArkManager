import { shell, ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  OpenExternalRequestSchema,
  ShowItemInFolderRequestSchema,
} from '../../../shared/types/ipc'
import { buildExternalUrl } from '../shell/buildExternalUrl'

export function registerShellHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, (_event, payload: unknown) => {
    const { code } = OpenExternalRequestSchema.parse(payload)
    const url = buildExternalUrl(code)
    return shell.openExternal(url)
  })

  ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, (_event, payload: unknown) => {
    const { path } = ShowItemInFolderRequestSchema.parse(payload)
    shell.showItemInFolder(path)
  })
}
