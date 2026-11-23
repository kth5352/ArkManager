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
