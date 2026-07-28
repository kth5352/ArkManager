import { describe, it, expect } from 'vitest'
import { buildExternalUrl } from './buildExternalUrl'

describe('buildExternalUrl', () => {
  it('builds a DLsite maniax URL for an RJ code', () => {
    expect(buildExternalUrl({ type: 'RJ', value: 'RJ01169914' })).toBe(
      'https://www.dlsite.com/maniax/work/=/product_id/RJ01169914.html'
    )
  })

  it('builds a DLsite pro URL for a VJ code (different category path than RJ)', () => {
    expect(buildExternalUrl({ type: 'VJ', value: 'VJ01004728' })).toBe(
      'https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html'
    )
  })

  it('builds a Steam URL for an ST code, stripping the ST prefix', () => {
    expect(buildExternalUrl({ type: 'ST', value: 'ST4282500' })).toBe(
      'https://store.steampowered.com/app/4282500'
    )
  })
})
