import { dialog, ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  LaunchGameRequestSchema,
  ListExecutablesRequestSchema,
  SetLaunchConfigRequestSchema,
} from '../../../shared/types/ipc'
import { NO_LAUNCH_CONFIG_ERROR_MESSAGE } from '../../../shared/launchErrors'
import { listExecutables } from '../launch/listExecutables'
import { detectLocaleEmulator } from '../launch/localeEmulator'
import { launchGame } from '../launch/launchGame'
import { endSession, startSession } from '../launch/activeSessions'
import {
  getGameUserData,
  recordPlaySession,
  setLaunchConfig,
} from '../database/gameUserDataRepository'
import { getSetting } from '../database/settingsRepository'
import { resolveGameEntryKey } from './resolveGameEntryKey'
import { listLibraries } from '../database/librariesRepository'
import { isPathWithinAnyLibrary } from '../thumbnailProtocol'
import type { AppDatabase } from '../database/client'

function libraryRootsOf(db: AppDatabase): string[] {
  return listLibraries(db).map((library) => library.path)
}

export function registerLaunchHandlers(db: AppDatabase): void {
  // Both handlers below only ever legitimately deal with paths under a
  // registered library - the renderer always derives folderPath from a
  // scanned entry's own path (LaunchConfigDialog.tsx) and executablePath
  // from listExecutables' own output for that same folder, never freely
  // typed. Without this check, a compromised or buggy renderer could probe
  // arbitrary folders for .exe files (LAUNCH_LIST_EXECUTABLES) or persist a
  // launch config that later gets spawn()'d with no user interaction at all
  // (LAUNCH_SET_CONFIG, see LAUNCH_GAME below) - a local code-execution
  // primitive.
  ipcMain.handle(IPC_CHANNELS.LAUNCH_LIST_EXECUTABLES, (_event, payload: unknown) => {
    const { folderPath } = ListExecutablesRequestSchema.parse(payload)
    if (!isPathWithinAnyLibrary(folderPath, libraryRootsOf(db))) return []
    return listExecutables(folderPath)
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCH_IS_LOCALE_EMULATOR_AVAILABLE, async () => {
    const overridePath = getSetting(db, 'locale-emulator-path')
    return (await detectLocaleEmulator(overridePath)) !== null
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCH_PICK_LOCALE_EMULATOR_PATH, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'LEProc.exe', extensions: ['exe'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCH_SET_CONFIG, (_event, payload: unknown) => {
    const { identifier, config } = SetLaunchConfigRequestSchema.parse(payload)
    if (!isPathWithinAnyLibrary(config.executablePath, libraryRootsOf(db))) {
      throw new Error('허용되지 않은 실행 파일 경로입니다.')
    }
    const { key, keyType } = resolveGameEntryKey(identifier)
    setLaunchConfig(db, key, keyType, config)
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCH_GAME, async (_event, payload: unknown) => {
    const { identifier } = LaunchGameRequestSchema.parse(payload)
    const { key, keyType } = resolveGameEntryKey(identifier)

    const userData = getGameUserData(db, key)
    if (!userData?.launchConfig) {
      throw new Error(NO_LAUNCH_CONFIG_ERROR_MESSAGE)
    }

    startSession(key, keyType)
    try {
      const overridePath = getSetting(db, 'locale-emulator-path')
      const { sessionMs } = await launchGame(userData.launchConfig, overridePath)
      recordPlaySession(db, key, keyType, sessionMs)
      return { sessionMs }
    } finally {
      endSession(key)
    }
  })
}
