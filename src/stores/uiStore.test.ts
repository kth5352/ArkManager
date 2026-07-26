import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from './uiStore'

describe('useUiStore', () => {
  beforeEach(() => {
    useUiStore.setState({ viewMode: 'gallery' })
  })

  it('defaults to gallery view mode', () => {
    expect(useUiStore.getState().viewMode).toBe('gallery')
  })

  it('switches view mode', () => {
    useUiStore.getState().setViewMode('list')
    expect(useUiStore.getState().viewMode).toBe('list')
  })
})
