// Pure rules for the seek-bar scene preview (spec §3.7, §4.5). The hook
// (useSeekPreview.ts) and the card (SeekPreview.tsx) only wire these up.

// Requests are made for the START of a bucket, so the response's echoed
// `seconds` doubles as the cache key.
export const PREVIEW_BUCKET_COUNT = 200
export const PREVIEW_CACHE_MAX = 300
// Card widths: the frame is 240x135; narrow windows get a CSS-scaled 192x108.
export const PREVIEW_CARD_WIDTH = 240
export const PREVIEW_CARD_WIDTH_NARROW = 192
export const PREVIEW_NARROW_VIEWPORT = 640
// Width of the time-only pill (no frame) - fixed so it can be clamped.
export const PREVIEW_PILL_WIDTH = 64
export const PREVIEW_EDGE_MARGIN = 8

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Bucket start (seconds) for a pointer time, or null when the duration is
// unknown. Bucket size is max(1s, duration/200); the result is clamped so the
// last bucket still starts inside the file.
export function bucketFor(seconds: number, duration: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(seconds)) return null
  const size = Math.max(1, duration / PREVIEW_BUCKET_COUNT)
  const start = Math.floor(seconds / size) * size
  return Math.min(Math.max(0, start), Math.max(0, duration - size))
}

// The preview generation is adopted only from an update about the current
// track; a late update of the previous track keeps the current value.
export function nextPreviewGeneration(
  current: number | null,
  trackPath: string,
  update: { loadedPath: string | null; loadGeneration: number }
): number | null {
  return update.loadedPath === trackPath ? update.loadGeneration : current
}

// Late-response rule (spec §4.5): another generation (or none) -> drop it
// entirely; same generation -> cache it, but draw only when it is the bucket
// under the pointer and no newer request for it has been drawn already.
export function shouldDisplayPreview(
  res: { generation: number; seconds: number; requestId: number },
  cur: { generation: number | null; hoveredBucket: number | null; lastDrawnRequestId: number }
): { cache: boolean; draw: boolean } {
  if (cur.generation === null || res.generation !== cur.generation) {
    return { cache: false, draw: false }
  }
  return {
    cache: true,
    draw: res.seconds === cur.hoveredBucket && res.requestId > cur.lastDrawnRequestId,
  }
}

export interface PreviewCache<T> {
  get(key: number): T | undefined
  has(key: number): boolean
  set(key: number, value: T): void
  clear(): void
  readonly size: number
}

// Map-based LRU: get() refreshes recency, set() evicts the least recent.
export function createPreviewCache<T>(max = PREVIEW_CACHE_MAX): PreviewCache<T> {
  const map = new Map<number, T>()
  return {
    get(key) {
      const value = map.get(key)
      if (value === undefined) return undefined
      map.delete(key)
      map.set(key, value)
      return value
    },
    has(key) {
      return map.has(key)
    },
    set(key, value) {
      map.delete(key)
      map.set(key, value)
      while (map.size > max) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        map.delete(oldest)
      }
    },
    clear() {
      map.clear()
    },
    get size() {
      return map.size
    },
  }
}

// Left offset (px, relative to the seek wrapper) of a card of `cardWidth`
// centred on the pointer, kept `margin` px inside the window on both sides.
export function clampPreviewLeft(
  pointerClientX: number,
  cardWidth: number,
  wrapperLeft: number,
  viewportWidth: number,
  margin = PREVIEW_EDGE_MARGIN
): number {
  const min = margin
  const max = Math.max(min, viewportWidth - margin - cardWidth)
  const viewportLeft = Math.min(Math.max(pointerClientX - cardWidth / 2, min), max)
  return viewportLeft - wrapperLeft
}

export function previewCardWidth(viewportWidth: number): number {
  return viewportWidth < PREVIEW_NARROW_VIEWPORT ? PREVIEW_CARD_WIDTH_NARROW : PREVIEW_CARD_WIDTH
}

// Pointer x -> seconds along a seek bar, or null when it can't be computed.
export function secondsAtPointer(
  clientX: number,
  rect: { left: number; width: number },
  duration: number
): number | null {
  if (!(rect.width > 0) || !Number.isFinite(duration) || duration <= 0) return null
  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
  return ratio * duration
}
