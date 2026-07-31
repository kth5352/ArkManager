import { ipcMain } from 'electron'
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
import { resolveGameEntryKey } from './resolveGameEntryKey'
import type { AppDatabase } from '../database/client'

export function registerLaunchHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.LAUNCH_LIST_EXECUTABLES, (_event, payload: unknown) => {
    const { folderPath } = ListExecutablesRequestSchema.parse(payload)
    return listExecutables(folderPath)
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCH_IS_LOCALE_EMULATOR_AVAILABLE, async () => {
    return (await detectLocaleEmulator()) !== null
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCH_SET_CONFIG, (_event, payload: unknown) => {
    const { identifier, config } = SetLaunchConfigRequestSchema.parse(payload)
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
      const { sessionMs } = await launchGame(userData.launchConfig)
      recordPlaySession(db, key, keyType, sessionMs)
      return { sessionMs }
    } finally {
      endSession(key)
    }
  })
}
