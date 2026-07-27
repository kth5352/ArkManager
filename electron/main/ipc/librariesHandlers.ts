import { existsSync } from 'node:fs'
import { dialog, ipcMain } from 'electron'
import { AddLibraryRequestSchema, IPC_CHANNELS, RemoveLibraryRequestSchema } from '../../../shared/types/ipc'
import type { LibraryWithStatus } from '../../../shared/types/ipc'
import { addLibrary, listLibraries, removeLibrary } from '../database/librariesRepository'
import type { AppDatabase } from '../database/client'

export function registerLibrariesHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.LIBRARIES_LIST, (): LibraryWithStatus[] => {
    return listLibraries(db).map((library) => ({ ...library, exists: existsSync(library.path) }))
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_ADD, (_event, payload: unknown) => {
    const { name, path } = AddLibraryRequestSchema.parse(payload)
    return addLibrary(db, name, path)
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_REMOVE, (_event, payload: unknown) => {
    const { id } = RemoveLibraryRequestSchema.parse(payload)
    removeLibrary(db, id)
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
