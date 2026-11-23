import { describe, expect, it, vi } from 'vitest'
import { createPreviewQueue } from './previewQueue'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (e: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createPreviewQueue', () => {
  it('runs the first job, replaces the waiting one and resolves the replaced job null', async () => {
    const gates = new Map<number, ReturnType<typeof deferred<string>>>()
    const run = vi.fn((job: number) => {
      const gate = deferred<string>()
      gates.set(job, gate)
      return gate.promise
    })
    const queue = createPreviewQueue(run)

    const first = queue.enqueue(1)
    const second = queue.enqueue(2)
    const third = queue.enqueue(3)

    // The replaced job settles right away, without ever running.
    await expect(second).resolves.toBeNull()
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenLastCalledWith(1)

    gates.get(1)!.resolve('one')
    await expect(first).resolves.toBe('one')
    // The waiting job starts only after the in-flight one finished.
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    expect(run).toHaveBeenLastCalledWith(3)

    gates.get(3)!.resolve('three')
    await expect(third).resolves.toBe('three')
    expect(run.mock.calls.map((c) => c[0])).toEqual([1, 3])
  })

  it('never aborts the in-flight job and routes each result to its own caller', async () => {
    const gates: Array<ReturnType<typeof deferred<string>>> = []
    const queue = createPreviewQueue((job: string) => {
      const gate = deferred<string>()
      gates.push(gate)
      return gate.promise.then((v) => `${job}:${v}`)
    })
    const a = queue.enqueue('a')
    const b = queue.enqueue('b')
    gates[0].resolve('x')
    await expect(a).resolves.toBe('a:x')
    await vi.waitFor(() => expect(gates).toHaveLength(2))
    gates[1].resolve('y')
    await expect(b).resolves.toBe('b:y')
  })

  it('resolves null when run throws or rejects and keeps processing later jobs', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let calls = 0
    const queue = createPreviewQueue(async (job: number) => {
      calls++
      if (job === 1) throw new Error('boom')
      if (job === 2) return Promise.reject(new Error('nope'))
      return job * 10
    })
    const r1 = queue.enqueue(1)
    const r2 = queue.enqueue(2)
    await expect(r1).resolves.toBeNull()
    await expect(r2).resolves.toBeNull()
    await expect(queue.enqueue(3)).resolves.toBe(30)
    expect(calls).toBe(3)
    error.mockRestore()
  })

  it('also survives a run that throws synchronously', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const queue = createPreviewQueue((job: number): Promise<number> => {
      if (job === 1) throw new Error('sync')
      return Promise.resolve(job)
    })
    await expect(queue.enqueue(1)).resolves.toBeNull()
    await expect(queue.enqueue(2)).resolves.toBe(2)
    error.mockRestore()
  })
})
