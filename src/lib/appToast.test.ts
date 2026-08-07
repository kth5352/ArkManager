import { beforeEach, describe, expect, it, vi } from 'vitest'

const sonner = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(sonner.info, {
    success: sonner.success,
    error: sonner.error,
  }),
}))

import { appToast } from './appToast'

describe('appToast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies standard durations while allowing callers to override them', () => {
    appToast.success('Saved')
    appToast.error('Failed')
    appToast.info('Working', { duration: 1000 })

    expect(sonner.success).toHaveBeenCalledWith('Saved', { duration: 3500 })
    expect(sonner.error).toHaveBeenCalledWith('Failed', { duration: 5000 })
    expect(sonner.info).toHaveBeenCalledWith('Working', { duration: 1000 })
  })
})
