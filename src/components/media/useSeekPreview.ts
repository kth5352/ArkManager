import { useCallback, useLayoutEffect, useState } from 'react'
import type { MpvPreviewFrame } from '../../../shared/types/ipc'
import { bucketFor, createPreviewCache, shouldDisplayPreview } from './seekPreview'

export interface SeekPreviewFrame {
  bucket: number
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

interface StoredFrame extends SeekPreviewFrame {
  trackPath: string
  generation: number
}

interface UseSeekPreviewOptions {
  trackPath: string | null
  isVideo: boolean
  duration: number
  // playback.loadGeneration - already null until main reports the CURRENT
  // track (useMediaPlayback's track-change reset + loadedPath gate).
  generation: number | null
}

// Mutable request bookkeeping, kept out of React state: at most one request
// in flight from this bar; when it returns and the pointer moved to another
// uncached bucket, the newest hovered bucket is requested next. `epoch`
// changes on every invalidation so a response that outlives its track (or
// the component) is ignored entirely.
class SeekPreviewController {
  private readonly cache = createPreviewCache<StoredFrame>()
  private trackPath: string | null = null
  private generation: number | null = null
  private isVideo = false
  private duration = 0
  private hovered: number | null = null
  private inFlight = false
  private epoch = 0
  private nextRequestId = 0
  private lastDrawnRequestId = 0
  // Bucket whose last request came back empty or dropped - not retried until
  // the pointer moves on (a disabled preview answers null to everything).
  private failed: number | null = null
  private alive = false

  constructor(private readonly draw: (frame: StoredFrame) => void) {}

  start(): void {
    this.alive = true
  }

  dispose(): void {
    this.alive = false
    this.invalidate()
  }

  sync(trackPath: string | null, generation: number | null, isVideo: boolean, duration: number) {
    if (trackPath !== this.trackPath || generation !== this.generation) {
      this.invalidate()
      this.trackPath = trackPath
      this.generation = generation
    }
    this.isVideo = isVideo
    this.duration = duration
    this.pump()
  }

  hover(seconds: number | null): number | null {
    const bucket =
      seconds === null || !this.isVideo || this.trackPath === null
        ? null
        : bucketFor(seconds, this.duration)
    if (bucket === this.hovered) return bucket
    this.hovered = bucket
    if (bucket === null) return null
    if (bucket !== this.failed) this.failed = null
    const hit = this.generation === null ? undefined : this.cache.get(bucket)
    if (hit) this.draw(hit)
    else this.pump()
    return bucket
  }

  private invalidate(): void {
    this.cache.clear()
    this.epoch += 1
    this.inFlight = false
    this.lastDrawnRequestId = 0
    this.failed = null
  }

  private pump(): void {
    if (!this.alive || this.inFlight) return
    const generation = this.generation
    const bucket = this.hovered
    if (generation === null || bucket === null || !this.isVideo) return
    if (bucket === this.failed || this.cache.has(bucket)) return
    this.nextRequestId += 1
    const requestId = this.nextRequestId
    const epoch = this.epoch
    this.inFlight = true
    let pending: Promise<MpvPreviewFrame | null>
    try {
      pending = window.api.mpv.previewFrame({ seconds: bucket, generation, requestId })
    } catch {
      pending = Promise.resolve(null)
    }
    pending.then(
      (res) => this.receive(epoch, bucket, res),
      () => this.receive(epoch, bucket, null)
    )
  }

  private receive(epoch: number, bucket: number, res: MpvPreviewFrame | null): void {
    if (!this.alive || epoch !== this.epoch) return
    this.inFlight = false
    if (!res) {
      this.failed = bucket
    } else {
      const decision = shouldDisplayPreview(res, {
        generation: this.generation,
        hoveredBucket: this.hovered,
        lastDrawnRequestId: this.lastDrawnRequestId,
      })
      if (decision.cache && this.trackPath !== null && this.generation !== null) {
        const frame: StoredFrame = {
          bucket: res.seconds,
          // A copy: the cloned IPC buffer is typed ArrayBufferLike, ImageData needs ArrayBuffer.
          data: new Uint8ClampedArray(res.data),
          width: res.width,
          height: res.height,
          trackPath: this.trackPath,
          generation: this.generation,
        }
        this.cache.set(res.seconds, frame)
        if (decision.draw) {
          this.lastDrawnRequestId = res.requestId
          this.draw(frame)
        }
      } else {
        // Dropped answer: don't loop re-asking for the same bucket.
        this.failed = bucket
      }
    }
    this.pump()
  }
}

// Seek-bar scene preview (spec §3.7, §4.5 steps 1-2). Requests only while the
// generation is known; a track change (or the generation going null) clears
// the cache and drops every in-flight answer at once. `frame` is non-null
// only for the bucket currently under the pointer, of the current track.
export function useSeekPreview({
  trackPath,
  isVideo,
  duration,
  generation,
}: UseSeekPreviewOptions): {
  onHover: (secondsAtPointer: number | null) => void
  frame: SeekPreviewFrame | null
} {
  const [drawn, setDrawn] = useState<StoredFrame | null>(null)
  const [hoveredBucket, setHoveredBucket] = useState<number | null>(null)
  const [controller] = useState(() => new SeekPreviewController(setDrawn))

  // Layout effects: the invalidation lands in the same commit as the track
  // change, before any queued IPC answer can be processed.
  useLayoutEffect(() => {
    controller.start()
    return () => controller.dispose()
  }, [controller])

  useLayoutEffect(() => {
    controller.sync(trackPath, generation, isVideo, duration)
  }, [controller, trackPath, generation, isVideo, duration])

  const onHover = useCallback(
    (secondsAtPointer: number | null) => {
      setHoveredBucket(controller.hover(secondsAtPointer))
    },
    [controller]
  )

  const frame =
    drawn !== null &&
    isVideo &&
    hoveredBucket !== null &&
    drawn.bucket === hoveredBucket &&
    drawn.trackPath === trackPath &&
    drawn.generation === generation
      ? drawn
      : null

  return { onHover, frame }
}
