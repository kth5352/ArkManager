// The scene-preview mpv's request loop (spec §4.5 step 5), kept free of
// Electron and of the real addon so it can be unit-tested with a fake addon.
// mpvPreviewWorker.ts is the thin utilityProcess wrapper around it.
//
// The addon starts the preview session paused, silent (ao=null, aid=no) and
// with cheap keyframe seeks (`init(..., { preview: true })`, mpv_addon.cc).
// Nothing here ever un-pauses mpv or touches its volume.

export const PREVIEW_WIDTH = 240
export const PREVIEW_HEIGHT = 135
export const PREVIEW_FRAME_BYTES = PREVIEW_WIDTH * PREVIEW_HEIGHT * 4

export interface PreviewAddon {
  init(
    filePath: string,
    width: number,
    height: number,
    hwdecMode: string,
    options: { preview: true }
  ): string
  loadFile(filePath: string): string
  seek(seconds: number, mode: 'keyframes'): string
  renderFrame(width: number, height: number): Buffer | null
  pollEvent(): { name: string; error?: string } | null
  shutdown(): string
  // Only used as a version marker, see isPreviewCapableAddon.
  getMediaTitle?: unknown
}

// An addon built before preview mode existed silently ignores init's 5th
// argument, so its "preview" mpv would start unpaused WITH audio. getMediaTitle
// shipped in the same addon build as preview mode, so its presence marks an
// addon that honours `{ preview: true }`.
export function isPreviewCapableAddon(addon: { getMediaTitle?: unknown }): boolean {
  return typeof addon.getMediaTitle === 'function'
}

export interface PreviewSessionOptions {
  // Matches the measured spike (electron/native/mpv-addon/preview-latency.cjs).
  tickMs?: number
  loadTimeoutMs?: number
  seekTimeoutMs?: number
  now?: () => number
  // Called once when the addon is not preview-capable (see isPreviewCapableAddon).
  log?: (msg: string) => void
}

export interface PreviewSession {
  requestFrame(filePath: string, seconds: number): Promise<Uint8Array | null>
  shutdown(): void
}

// Messages between mpvPreviewManager.ts (main) and mpvPreviewWorker.ts.
export type PreviewWorkerRequest =
  { type: 'frame'; id: number; seconds: number; path: string } | { type: 'shutdown' }
export type PreviewWorkerResponse =
  { type: 'frame-result'; id: number; data: Uint8Array | null } | { type: 'log'; msg: string }

type StepResult = 'pending' | 'done' | 'fail'

export function createPreviewSession(
  addon: PreviewAddon,
  options: PreviewSessionOptions = {}
): PreviewSession {
  const tickMs = options.tickMs ?? 4
  const loadTimeoutMs = options.loadTimeoutMs ?? 3000
  const seekTimeoutMs = options.seekTimeoutMs ?? 800
  const now = options.now ?? ((): number => performance.now())

  let initialized = false
  // The file whose initial load fully completed; null forces a (re)load.
  let loadedPath: string | null = null
  let chain: Promise<unknown> = Promise.resolve()
  let busy = false

  function drainEvents(): void {
    while (addon.pollEvent()) {
      // Stale events from before this request mean nothing to it.
    }
  }

  // Calls `step` on every tick until it reports done/fail or the timeout passes.
  function runTicks(step: () => StepResult, timeoutMs: number): Promise<boolean> {
    const startedAt = now()
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        let result: StepResult
        try {
          result = step()
        } catch {
          result = 'fail'
        }
        if (result === 'pending' && now() - startedAt >= timeoutMs) result = 'fail'
        if (result === 'pending') return
        clearInterval(interval)
        resolve(result === 'done')
      }, tickMs)
    })
  }

  function isUsableFrame(frame: Buffer | null): frame is Buffer {
    return frame !== null && frame.length === PREVIEW_FRAME_BYTES
  }

  // Makes `filePath` the loaded file: init on first use, loadFile afterwards.
  // Done once the file loaded AND mpv reported its initial playback-restart -
  // seeking before that restart would let it be mistaken for the seek's own.
  async function ensureLoaded(filePath: string): Promise<boolean> {
    if (initialized && loadedPath === filePath) return true
    loadedPath = null
    drainEvents()
    if (!initialized) {
      const result = addon.init(filePath, PREVIEW_WIDTH, PREVIEW_HEIGHT, 'no', { preview: true })
      if (result !== 'OK') {
        // Init can fail after creating the mpv context; release everything so
        // the next request starts from a clean addon.
        addon.shutdown()
        return false
      }
      initialized = true
    } else if (addon.loadFile(filePath) !== 'OK') {
      return false
    }

    let started = false
    let fileLoaded = false
    const ok = await runTicks(() => {
      for (let ev = addon.pollEvent(); ev; ev = addon.pollEvent()) {
        if (ev.error) return 'fail'
        if (ev.name === 'start-file') started = true
        else if (started && !fileLoaded && ev.name === 'end-file') return 'fail'
        else if (started && ev.name === 'file-loaded') fileLoaded = true
        else if (fileLoaded && ev.name === 'playback-restart') return 'done'
      }
      // A paused restart waits for the VO to render (see the CONTRACT in
      // preview-latency.cjs), so keep rendering while waiting.
      addon.renderFrame(PREVIEW_WIDTH, PREVIEW_HEIGHT)
      return 'pending'
    }, loadTimeoutMs)
    if (ok) loadedPath = filePath
    return ok
  }

  async function seekAndRender(seconds: number): Promise<Uint8Array | null> {
    drainEvents()
    // An abandoned (failed or timed-out) seek can still deliver its frame and
    // playback-restart later, which the next seek could not tell apart from
    // its own. Forgetting the loaded file makes the next request reload it,
    // and the reload's ordered start-file -> file-loaded -> restart wait
    // ignores any such stray restart. Costs one reload, only after a failure.
    if (addon.seek(seconds, 'keyframes') !== 'OK') {
      loadedPath = null
      return null
    }
    let restarted = false
    let frame: Buffer | null = null
    // CONTRACT (preview-latency.cjs): render on every tick while the seek is
    // pending; the result is the first successful render AFTER
    // playback-restart. Rendering only after the restart costs ~230ms.
    const ok = await runTicks(() => {
      for (let ev = addon.pollEvent(); ev; ev = addon.pollEvent()) {
        if (ev.name === 'playback-restart') restarted = true
        if (ev.name === 'end-file') {
          loadedPath = null
          return 'fail'
        }
      }
      const rendered = addon.renderFrame(PREVIEW_WIDTH, PREVIEW_HEIGHT)
      if (restarted && isUsableFrame(rendered)) {
        frame = rendered
        return 'done'
      }
      return 'pending'
    }, seekTimeoutMs)
    if (!ok || !frame) {
      loadedPath = null
      return null
    }
    // A fresh, exactly-sized copy (never a view into a shared pool).
    return new Uint8Array(frame as Buffer)
  }

  async function handle(filePath: string, seconds: number): Promise<Uint8Array | null> {
    try {
      if (!(await ensureLoaded(filePath))) return null
      return await seekAndRender(seconds)
    } catch {
      loadedPath = null
      return null
    }
  }

  const capable = isPreviewCapableAddon(addon)
  let incapableLogged = false

  return {
    requestFrame(filePath: string, seconds: number): Promise<Uint8Array | null> {
      if (!capable) {
        // Never init mpv on an old addon: it would play the file audibly.
        if (!incapableLogged) {
          incapableLogged = true
          options.log?.('preview disabled: mpv_addon.node predates preview mode (rebuild it)')
        }
        return Promise.resolve(null)
      }
      // Starts synchronously when idle; otherwise runs after the current one.
      const start = (): Promise<Uint8Array | null> => {
        busy = true
        return handle(filePath, seconds).finally(() => {
          busy = false
        })
      }
      const result = busy ? chain.then(start) : start()
      chain = result
      return result
    },
    shutdown(): void {
      if (initialized) addon.shutdown()
      initialized = false
      loadedPath = null
    },
  }
}
