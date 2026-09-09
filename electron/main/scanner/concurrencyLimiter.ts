// A minimal internal semaphore/mapLimit, not a dependency - caps how many
// callback functions run concurrently through one limiter instance,
// queueing the rest FIFO. Deliberately NOT applied around a whole recursive
// folder walk (that would let a parent scan wait on a permit held by its
// own not-yet-finished children, deadlocking) - only around the actual
// leaf-level stat() calls in folderScanner.ts, one permit per call,
// released in a finally regardless of success/failure/cancellation.
export function createConcurrencyLimiter(maxConcurrent: number) {
  if (maxConcurrent < 1) {
    throw new Error(`maxConcurrent must be at least 1, got ${maxConcurrent}`)
  }

  let active = 0
  const queue: Array<() => void> = []

  function scheduleNext(): void {
    if (active >= maxConcurrent) return
    const resolve = queue.shift()
    if (!resolve) return
    active++
    resolve()
  }

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      queue.push(resolve)
      scheduleNext()
    })
    try {
      return await fn()
    } finally {
      active--
      scheduleNext()
    }
  }
}
