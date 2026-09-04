import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import {
  IPC_CHANNELS,
  SubtitleLinePayloadSchema,
  type SubtitleLinePayload,
} from '../../../shared/types/ipc'
import { getSetting, setSetting } from '../database/settingsRepository'
import { clampSubtitlePipBounds, type WindowBounds } from '../subtitlePipBounds'
import type { AppDatabase } from '../database/client'

const DEFAULT_BOUNDS: WindowBounds = { x: 0, y: 0, width: 360, height: 90 }
// 저장된 위치가 없는 첫 실행 시, 주 모니터 우측 하단 근처에 둔다.
function computeDefaultBounds(): WindowBounds {
  const { workArea } = screen.getPrimaryDisplay()
  const width = DEFAULT_BOUNDS.width
  const height = DEFAULT_BOUNDS.height
  return {
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + workArea.height - height - 24,
    width,
    height,
  }
}

function readSavedBounds(db: AppDatabase): WindowBounds | null {
  const x = getSetting(db, 'subtitle-pip-x')
  const y = getSetting(db, 'subtitle-pip-y')
  const width = getSetting(db, 'subtitle-pip-width')
  const height = getSetting(db, 'subtitle-pip-height')
  if (x === undefined || y === undefined || width === undefined || height === undefined) return null
  const bounds = { x: Number(x), y: Number(y), width: Number(width), height: Number(height) }
  const allFinite = Object.values(bounds).every((n) => Number.isFinite(n))
  return allFinite ? bounds : null
}

function saveBounds(db: AppDatabase, bounds: WindowBounds): void {
  setSetting(db, 'subtitle-pip-x', String(bounds.x))
  setSetting(db, 'subtitle-pip-y', String(bounds.y))
  setSetting(db, 'subtitle-pip-width', String(bounds.width))
  setSetting(db, 'subtitle-pip-height', String(bounds.height))
}

// 항상 최대 1개(분리 재생 창과 동일한 싱글턴 패턴 - mediaWindowHandlers.ts 참고).
let pipWindow: BrowserWindow | null = null

// 마지막으로 릴레이한 값을 캐싱해뒀다가, 새로 열리는 PIP 창에 did-finish-load
// 시점에 한 번 밀어준다(mediaWindowHandlers.ts의 MEDIA_OPEN_PLAYER_WINDOW가
// MEDIA_STATE_SYNC로 하는 것과 동일한 패턴) - 이게 없으면 재생 중 PIP를 열었을
// 때 SUBTITLE_PIP_LINE_UPDATE는 값이 실제로 바뀔 때만 재전송되므로, 다음
// 활성 줄 변경 전까지(일시정지 중이라면 영영) 기본값('재생 중인 트랙이
// 없습니다')이 그대로 표시된다.
let lastPayload: SubtitleLinePayload | null = null

export function registerSubtitlePipWindowHandlers(
  db: AppDatabase,
  // Not read yet - open/close notifications go to every window via
  // BrowserWindow.getAllWindows() below. Kept as a parameter so this
  // signature matches its caller in index.ts (and mediaWindowHandlers.ts's
  // own registerMediaWindowHandlers), ready to use once a main-window-only
  // notification is needed.
  _getMainWindow: () => BrowserWindow | null
): {
  closeSubtitlePipWindow: () => void
} {
  function broadcastOpenState(channel: 'SUBTITLE_PIP_OPENED' | 'SUBTITLE_PIP_CLOSED'): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS[channel])
    }
  }

  ipcMain.handle(IPC_CHANNELS.SUBTITLE_PIP_OPEN, () => {
    if (pipWindow) {
      pipWindow.focus()
      broadcastOpenState('SUBTITLE_PIP_OPENED')
      return
    }

    const saved = readSavedBounds(db)
    const displayWorkAreas = screen.getAllDisplays().map((d) => d.workArea)
    const bounds = clampSubtitlePipBounds(saved, displayWorkAreas, computeDefaultBounds())

    const win = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      minWidth: 160,
      minHeight: 48,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
      },
    })

    // 드래그/리사이즈가 끝난 뒤에만 저장 - 'move'/'resize'는 드래그 도중
    // 계속 발생하므로, 매번 동기 SQLite write를 하지 않도록 짧게 디바운스한다.
    let saveTimeout: ReturnType<typeof setTimeout> | null = null
    function scheduleSave(): void {
      if (saveTimeout) clearTimeout(saveTimeout)
      saveTimeout = setTimeout(() => {
        if (win.isDestroyed()) return
        const [x, y] = win.getPosition()
        const [width, height] = win.getSize()
        saveBounds(db, { x, y, width, height })
      }, 300)
    }
    win.on('move', scheduleSave)
    win.on('resize', scheduleSave)

    // 새 창의 렌더러는 처음엔 no-track 기본값으로 시작한다 - 이미 재생 중이면
    // (혹은 일시정지 중이라 다음 변경 이벤트가 영영 안 올 수도 있으면) 로드가
    // 끝나는 즉시 마지막으로 알려진 값을 한 번 밀어준다.
    win.webContents.once('did-finish-load', () => {
      if (lastPayload) win.webContents.send(IPC_CHANNELS.SUBTITLE_PIP_LINE_UPDATE, lastPayload)
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/subtitle-pip`)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/subtitle-pip' })
    }

    win.on('closed', () => {
      if (saveTimeout) clearTimeout(saveTimeout)
      pipWindow = null
      broadcastOpenState('SUBTITLE_PIP_CLOSED')
    })

    pipWindow = win
    broadcastOpenState('SUBTITLE_PIP_OPENED')
  })

  ipcMain.handle(IPC_CHANNELS.SUBTITLE_PIP_CLOSE, () => {
    pipWindow?.close()
  })

  // 렌더러(호스팅 중인 창)→메인이 신뢰 경계이므로 여기서 검증한 뒤 PIP 창에만
  // 릴레이한다 - MEDIA_STATE_BROADCAST가 이미 확립한 것과 동일한 패턴.
  ipcMain.on(IPC_CHANNELS.SUBTITLE_PIP_LINE_UPDATE, (_event, payload: unknown) => {
    // safeParse, not parse: an ipcMain.on listener has no invoke promise to
    // reject into, so a throw here is an uncaught main-process exception -
    // matches MPV_SET_EQ_BAND's/MEDIA_STATE_BROADCAST's own established
    // pattern for this exact class of handler.
    const result = SubtitleLinePayloadSchema.safeParse(payload)
    if (!result.success) return
    const parsed = result.data
    lastPayload = parsed
    pipWindow?.webContents.send(IPC_CHANNELS.SUBTITLE_PIP_LINE_UPDATE, parsed)
  })

  return {
    closeSubtitlePipWindow: () => pipWindow?.close(),
  }
}
