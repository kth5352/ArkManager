import { beforeEach, describe, expect, it } from 'vitest'
import { useSelectionStore } from './selectionStore'

describe('selection store', () => {
  beforeEach(() => {
    useSelectionStore.getState().deactivate()
  })

  it('clears selected paths when selection mode is deactivated', () => {
    useSelectionStore.getState().activate('C:\\Library\\one')
    useSelectionStore.getState().toggle('C:\\Library\\two')

    useSelectionStore.getState().deactivate()

    expect(useSelectionStore.getState()).toMatchObject({
      isActive: false,
      selectedPaths: new Set(),
    })
  })
})
