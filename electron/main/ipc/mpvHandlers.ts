import { BrowserWindow, ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  MpvLoadRequestSchema,
  MpvResizeRequestSchema,
  MpvSeekRequestSchema,
  MpvSetEqBandRequestSchema,
  MpvSetVolumeRequestSchema,
} from '../../../shared/types/ipc'
import * as mpv from '../media/mpvProcessManager'
import { getSetting } from '../database/settingsRepository'
import { parseStoredMediaEqualizerBands } from './settingsHandlers'
import type { AppDatabase } from '../database/client'

export function registerMpvHandlers(
  db: AppDatabase,
  getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.handle(IPC_CHANNELS.MPV_LOAD, (event, payload: unknown) => {
    const { filePath, isVideo } = MpvLoadRequestSchema.parse(payload)
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()
    if (!win) return
    mpv.setHostWindow(win)
    // 1280x720 is only the initial render size, used for the handful of
    // frames produced before the renderer's ResizeObserver reports the real
    // surface size (one debounce cycle after mount) via MPV_RESIZE.
    mpv.loadFile(filePath, 1280, 720, isVideo)
  })

  // Re-points frame delivery at the calling window without touching playback
  // - what a detach/reattach host switch needs (the video keeps playing in
  // the utility process throughout; only the MessagePort recipient changes).
  ipcMain.handle(IPC_CHANNELS.MPV_BECOME_HOST, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()
    if (!win) return
    mpv.setHostWindow(win)
  })

  // ipcMain.on, not .handle - the preload side fires this with
  // ipcRenderer.send on every debounced resize tick and never awaits it.
  ipcMain.on(IPC_CHANNELS.MPV_RESIZE, (_event, payload: unknown) => {
    const { width, height } = MpvResizeRequestSchema.parse(payload)
    mpv.resize(width, height)
  })

  ipcMain.handle(IPC_CHANNELS.MPV_PLAY, () => mpv.play())
  ipcMain.handle(IPC_CHANNELS.MPV_PAUSE, () => mpv.pause())

  ipcMain.handle(IPC_CHANNELS.MPV_SEEK, (_event, payload: unknown) => {
    const { seconds } = MpvSeekRequestSchema.parse(payload)
    mpv.seek(seconds)
  })

  ipcMain.handle(IPC_CHANNELS.MPV_SET_VOLUME, (_event, payload: unknown) => {
    const { volume } = MpvSetVolumeRequestSchema.parse(payload)
    mpv.setVolume(volume)
  })

  // ipcMain.on, not .handle - fires on every slider-drag tick from the
  // preload side via ipcRenderer.send, same fire-and-forget shape as resize.
  ipcMain.on(IPC_CHANNELS.MPV_SET_EQ_BAND, (_event, payload: unknown) => {
    // safeParse, not parse: this is an ipcMain.on listener, so a throw here
    // is an uncaught main-process exception (there's no invoke promise to
    // reject into). A malformed payload just gets dropped instead - the EQ
    // is fire-and-forget, so silently ignoring a bad send is the graceful
    // failure mode.
    const result = MpvSetEqBandRequestSchema.safeParse(payload)
    if (!result.success) return
    mpv.setEqualizerBandGain(result.data.bandIndex, result.data.gainDb)
  })

  mpv.onWorkerMessage((msg) => {
    const m = msg as {
      type: string
      isPlaying?: boolean
      currentTime?: number
      duration?: number | null
      error?: string | null
      result?: string
    }
    if (m.type === 'state-update') {
      const win = mpv.getCurrentHostWindow()
      // The host window can be closed (or the whole app be quitting) while
      // the worker's ~4x/sec state push is still in flight - sending to a
      // destroyed window's webContents throws.
      if (!win || win.isDestroyed()) return
      win.webContents.send(IPC_CHANNELS.MPV_STATE_UPDATE, {
        isPlaying: m.isPlaying,
        currentTime: m.currentTime,
        duration: m.duration ?? null,
        // Forwarded, not hardcoded null: the worker's 'load' handler posts a
        // state-update with `error: result` when loadFile fails, and that's
        // the only way the renderer ever learns a track failed to open.
        error: m.error ?? null,
      })
      return
    }
    // addon.init() failed - the failure path for the FIRST track of a session
    // (e.g. libmpv-2.dll or mpv_addon.node not loadable). The worker posts its
    // own message type for this rather than a state-update, so it has to be
    // translated here or the renderer would sit on a frozen isPlaying:true
    // with no frames and no error. Forwarded over the same MPV_STATE_UPDATE
    // channel the load-failure path uses, so the renderer's existing error
    // handling covers it unchanged.
    if (m.type === 'init-failed') {
      const win = mpv.getCurrentHostWindow()
      if (!win || win.isDestroyed()) return
      win.webContents.send(IPC_CHANNELS.MPV_STATE_UPDATE, {
        isPlaying: false,
        currentTime: 0,
        duration: null,
        error: m.result ?? 'mpv init failed',
      })
      return
    }
    // A brand-new native mpv session just finished addon.init() (see
    // mpvWorker.ts's 'init' handler). This is the ONLY correct moment to
    // re-apply the persisted equalizer: Init() installs the 5-band `af`
    // chain with every band at 0dB, and setEqualizerBandGain is a no-op
    // until the native context exists (mpv_addon.cc returns "ERROR not
    // initialized" with no context, and the worker discards that result).
    // Doing it here rather than from a renderer effect is what makes
    // restoration correct in all three cases the old renderer-side version
    // got wrong: a cold start (the renderer's query resolved long before
    // mpv had ever been initialized, so its one-shot latch fired against a
    // null context), a crash-respawn (a fresh child always goes back
    // through 'init' - see mpvProcessManager's hasInitializedCurrentChild
    // reset - and gets restoration again here for free), and the detached
    // player window (its own renderer never ran that effect at all).
    if (m.type === 'init-ok') {
      const bands = parseStoredMediaEqualizerBands(getSetting(db, 'media-equalizer-bands'))
      // null = nothing persisted, or a corrupted row: the addon's own flat
      // default is already the right answer, so leave it alone.
      if (!bands) return
      bands.forEach((gainDb, bandIndex) => {
        // 0dB bands are skipped, not sent: init-ok means a freshly created
        // native context whose bands are all at 0dB already, so those calls
        // would be pure no-ops.
        if (gainDb !== 0) mpv.setEqualizerBandGain(bandIndex, gainDb)
      })
      return
    }
    // The current track hit its natural end (see mpvWorker.ts's
    // pollAndForwardEvents) - the renderer decides what that means
    // (auto-advance vs repeat-one), so this just relays the bare signal.
    if (m.type === 'ended') {
      const win = mpv.getCurrentHostWindow()
      if (!win || win.isDestroyed()) return
      win.webContents.send(IPC_CHANNELS.MPV_ENDED)
    }
  })
}
