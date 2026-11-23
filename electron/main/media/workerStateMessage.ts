// Builds the worker's `state-update` message. Every post carries the load
// identity (generation + requested path) the worker was GIVEN with its latest
// init/load message, so main can relay it as-is: stamping at relay time with
// main's current load state would label a still-in-flight update of the
// previous file with the next file's identity.
export interface WorkerLoadIdentity {
  loadGeneration: number
  loadedPath: string | null
}

// Before any init/load there is no load context: generation 0 and a null path,
// which the renderer never adopts (it matches loadedPath against its track).
export const NO_LOAD_IDENTITY: WorkerLoadIdentity = { loadGeneration: 0, loadedPath: null }

export interface WorkerStateUpdate extends WorkerLoadIdentity {
  type: 'state-update'
  isPlaying: boolean
  currentTime: number
  duration: number | null
  error: string | null
  mediaTitle: string | null
}

export function buildStateUpdate(
  identity: WorkerLoadIdentity,
  fields: {
    isPlaying: boolean
    currentTime: number
    duration: number | null
    error: string | null
    mediaTitle: string | null
  }
): WorkerStateUpdate {
  return {
    type: 'state-update',
    isPlaying: fields.isPlaying,
    currentTime: fields.currentTime,
    duration: fields.duration,
    error: fields.error,
    mediaTitle: fields.mediaTitle,
    loadGeneration: identity.loadGeneration,
    loadedPath: identity.loadedPath,
  }
}

// The worker's `ended` message carries the same identity as its state-updates,
// so a natural EOF of the previous track that races a user Next/Prev can be
// recognised (and ignored) by the renderer, which is already on the next track.
export interface WorkerEnded extends WorkerLoadIdentity {
  type: 'ended'
}

export function buildEndedMessage(identity: WorkerLoadIdentity): WorkerEnded {
  return { type: 'ended', loadGeneration: identity.loadGeneration, loadedPath: identity.loadedPath }
}

// getMediaTitle was added to the addon after the first release. An addon built
// before it (a checkout updated without `npm ci`) lacks it, and calling it in
// the worker's state loop would throw and kill the playback process - read it
// defensively so an old addon only loses the title.
export function readMediaTitle(addon: { getMediaTitle?: unknown }): string | null {
  if (typeof addon.getMediaTitle !== 'function') return null
  const title: unknown = (addon.getMediaTitle as () => unknown)()
  return typeof title === 'string' ? title : null
}
