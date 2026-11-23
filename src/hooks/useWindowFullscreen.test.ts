import { describe, expect, it } from 'vitest'
import { shouldRetryToggle } from './useWindowFullscreen'

describe('shouldRetryToggle', () => {
  it('retries only when the returned state equals the previous one', () => {
    expect(shouldRetryToggle(false, false)).toBe(true)
    expect(shouldRetryToggle(false, true)).toBe(false)
    expect(shouldRetryToggle(true, false)).toBe(false)
  })
})
