import { stat } from 'node:fs/promises'
import { BrowserWindow, dialog, shell, ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  OpenPathRequestSchema,
  OpenExternalRequestSchema,
  ShowItemInFolderRequestSchema,
} from '../../../shared/types/ipc'
import { buildExternalUrl } from '../shell/buildExternalUrl'
import { isRiskyToOpen } from '../shell/openPathPolicy'
import { getSetting } from '../database/settingsRepository'
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

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_PATH, async (event, payload: unknown) => {
    const { path } = OpenPathRequestSchema.parse(payload)
    if (path.includes('\0') || !isPathWithinAnyLibrary(path, libraryRootsOf(db))) {
      throw new Error('Path is outside registered libraries.')
    }

    // Folders open in the OS file explorer without any risk. A *file* is
    // handed to its default handler, which for .exe/.lnk/.bat/... executes
    // it - those need an explicit confirmation that only the main process
    // can show (a compromised renderer cannot click it).
    let isDirectory: boolean
    try {
      isDirectory = (await stat(path)).isDirectory()
    } catch {
      throw new Error('Path does not exist.')
    }
    if (!isDirectory && isRiskyToOpen(path)) {
      const texts = openConfirmTexts(getSetting(db, 'locale'))
      const owner = BrowserWindow.fromWebContents(event.sender)
      const options = {
        type: 'warning' as const,
        buttons: [texts.cancel, texts.run],
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
      if (response !== 1) return
    }

    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })
}

function openConfirmTexts(locale: string | undefined): {
  title: string
  message: string
  cancel: string
  run: string
} {
  if (locale === 'ja') {
    return {
      title: 'ファイルを開く',
      message: 'このファイルは実行される可能性があります。信頼できる場合のみ開いてください。',
      cancel: 'キャンセル',
      run: '開く',
    }
  }
  if (locale === 'en') {
    return {
      title: 'Open file',
      message: 'This file may run a program. Only open it if you trust it.',
      cancel: 'Cancel',
      run: 'Open',
    }
  }
  return {
    title: '파일 열기',
    message: '이 파일은 프로그램을 실행할 수 있습니다. 신뢰하는 파일일 때만 여세요.',
    cancel: '취소',
    run: '열기',
  }
}
