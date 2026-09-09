import { describe, expect, it } from 'vitest'
import { createConcurrencyLimiter } from './concurrencyLimiter'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('createConcurrencyLimiter', () => {
  it('never runs more than maxConcurrent tasks at once', async () => {
    const limit = createConcurrencyLimiter(3)
    let active = 0
    let peak = 0

    const tasks = Array.from({ length: 20 }, (_, i) =>
      limit(async () => {
        active++
        peak = Math.max(peak, active)
        await delay(5)
        active--
        return i
      })
    )
    const results = await Promise.all(tasks)

    expect(peak).toBeLessThanOrEqual(3)
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })

  it('runs every queued task eventually, none dropped', async () => {
    const limit = createConcurrencyLimiter(2)
    const seen: number[] = []
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        limit(async () => {
          seen.push(i)
        })
      )
    )
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i))
  })

  it('releases the permit when a task throws, so the queue keeps draining', async () => {
    const limit = createConcurrencyLimiter(1)
    const results: Array<'ok' | 'error'> = []

    await Promise.all([
      limit(async () => {
        throw new Error('simulated failure')
      }).catch(() => results.push('error')),
      limit(async () => {
        results.push('ok')
      }),
      limit(async () => {
        results.push('ok')
      }),
    ])

    // All three tasks ran (nothing got stuck behind the failed one) - order
    // isn't asserted since the failing task's catch races the other two.
    expect(results.filter((r) => r === 'ok')).toHaveLength(2)
    expect(results.filter((r) => r === 'error')).toHaveLength(1)
  })

  it('propagates each task result independently through the returned promise', async () => {
    const limit = createConcurrencyLimiter(4)
    const a = limit(async () => 'a-result')
    const b = limit(async () => 42)
    expect(await a).toBe('a-result')
    expect(await b).toBe(42)
  })

  it('rejects a maxConcurrent below 1', () => {
    expect(() => createConcurrencyLimiter(0)).toThrow()
  })
})
