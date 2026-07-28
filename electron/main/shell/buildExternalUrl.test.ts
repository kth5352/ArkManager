import { describe, it, expect } from 'vitest'
import { buildExternalUrl } from './buildExternalUrl'

describe('buildExternalUrl', () => {
  it('builds a DLsite URL for an RJ code', () => {
    expect(buildExternalUrl({ type: 'RJ', value: 'RJ01169914' })).toBe(
      'http://dlsite.com/maniax/work/=/product_id/RJ01169914.html'
    )
  })

  it('builds a DLsite URL for a VJ code using the same pattern', () => {
    expect(buildExternalUrl({ type: 'VJ', value: 'VJ009988' })).toBe(
      'http://dlsite.com/maniax/work/=/product_id/VJ009988.html'
    )
  })

  it('builds a Steam URL for an ST code, stripping the ST prefix', () => {
    expect(buildExternalUrl({ type: 'ST', value: 'ST4282500' })).toBe(
      'https://store.steampowered.com/app/4282500'
    )
  })
})
