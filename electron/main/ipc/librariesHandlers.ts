import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import {
  AddLibraryRequestSchema,
  IPC_CHANNELS,
  RemoveLibraryRequestSchema,
} from '../../../shared/types/ipc'
import type { LibraryWithStatus } from '../../../shared/types/ipc'
import { addLibrary, listLibraries, removeLibrary } from '../database/librariesRepository'
import { libraryPathRejection } from '../libraries/libraryPathPolicy'
import { normalizeLibraryPath } from '../../../shared/normalizeLibraryPath'
import { getSetting } from '../database/settingsRepository'
import type { AppDatabase } from '../database/client'

export function registerLibrariesHandlers(db: AppDatabase): void {
  // Only the folder the user just chose in the native picker is registered
  // silently. Typed / dropped paths (which a compromised renderer could also
  // fabricate) need an explicit native confirmation, because a library is a
  // trust root: the app may rename, move, trash and launch things under it.
  let lastPickedFolder: string | null = null

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_LIST, (): LibraryWithStatus[] => {
    return listLibraries(db).map((library) => ({ ...library, exists: existsSync(library.path) }))
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_ADD, async (event, payload: unknown) => {
    const { name, path } = AddLibraryRequestSchema.parse(payload)

    let isDirectory = false
    try {
      isDirectory = statSync(path).isDirectory()
    } catch {
      isDirectory = false
    }
    if (!isDirectory) throw new Error('The selected path is not an existing folder.')

    const rejection = libraryPathRejection(path, {
      userDataDir: app.getPath('userData'),
      windowsDir: process.env['SystemRoot'] ?? process.env['windir'],
      programFilesDirs: [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']].filter(
        (p): p is string => Boolean(p)
      ),
      programDataDir: process.env['ProgramData'],
    })
    if (rejection) throw new Error(`This folder cannot be used as a library: ${rejection}.`)

    const picked = lastPickedFolder
    lastPickedFolder = null
    const cameFromPicker =
      picked !== null && normalizeLibraryPath(resolve(picked)) === normalizeLibraryPath(resolve(path))
    if (!cameFromPicker) {
      const texts = confirmTexts(getSetting(db, 'locale'))
      const owner = BrowserWindow.fromWebContents(event.sender)
      const options = {
        type: 'question' as const,
        buttons: [texts.cancel, texts.add],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: texts.title,
        message: texts.message,
        detail: path,
      }
      const { response } = owner
        ? await dialog.showMessageBox(owner, options)
        : await dialog.showMessageBox(options)
      if (response !== 1) throw new Error('Library registration was cancelled.')
    }

    return addLibrary(db, name, path)
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_REMOVE, (_event, payload: unknown) => {
    const { id } = RemoveLibraryRequestSchema.parse(payload)
    removeLibrary(db, id)
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    lastPickedFolder = result.filePaths[0]
    return lastPickedFolder
  })
}

function confirmTexts(locale: string | undefined): {
  title: string
  message: string
  cancel: string
  add: string
} {
  if (locale === 'ja') {
    return {
      title: 'ライブラリを追加',
      message:
        'このフォルダをライブラリとして登録します。アプリはこの中のファイルの名前変更・移動・削除・実行を行えるようになります。',
      cancel: 'キャンセル',
      add: '追加',
    }
  }
  if (locale === 'en') {
    return {
      title: 'Add library',
      message:
        'Register this folder as a library? The app will be allowed to rename, move, delete and launch files inside it.',
      cancel: 'Cancel',
      add: 'Add',
    }
  }
  return {
    title: '라이브러리 추가',
    message:
      '이 폴더를 라이브러리로 등록합니다. 앱이 이 폴더 안 파일의 이름변경·이동·삭제·실행을 할 수 있게 됩니다.',
    cancel: '취소',
    add: '추가',
  }
}
