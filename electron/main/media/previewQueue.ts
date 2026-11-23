// Latest-wins work queue for scene-preview requests (spec §4.5 step 4): at
// most one job runs and at most one waits. A new job REPLACES the waiting one,
// whose caller gets `null` right away - when the pointer sweeps across the
// seek bar only the last hovered point is worth decoding. The in-flight job is
// never aborted (the preview mpv cannot cancel a seek halfway anyway) and its
// result still goes back to its own caller. A failing `run` resolves its
// caller `null` and the queue keeps going.
export interface PreviewQueue<T, R> {
  enqueue(job: T): Promise<R | null>
}

interface QueuedJob<T, R> {
  job: T
  resolve: (result: R | null) => void
}

export function createPreviewQueue<T, R>(run: (job: T) => Promise<R>): PreviewQueue<T, R> {
  let running = false
  let waiting: QueuedJob<T, R> | null = null

  async function execute(entry: QueuedJob<T, R>): Promise<void> {
    running = true
    try {
      entry.resolve(await run(entry.job))
    } catch (error) {
      console.error('[previewQueue] preview job failed', error)
      entry.resolve(null)
    } finally {
      running = false
      const next = waiting
      waiting = null
      if (next) void execute(next)
    }
  }

  return {
    enqueue(job: T): Promise<R | null> {
      return new Promise<R | null>((resolve) => {
        const entry = { job, resolve }
        if (!running) {
          void execute(entry)
          return
        }
        waiting?.resolve(null)
        waiting = entry
      })
    },
  }
}
