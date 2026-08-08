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

  it('builds a VNDB URL for a VNV code', () => {
    expect(buildExternalUrl({ type: 'VNV', value: 'VNV17' })).toBe('https://vndb.org/v17')
  })

  it('builds a VNDB release URL for VNR codes', () => {
    expect(buildExternalUrl({ type: 'VNR', value: 'VNR45775' })).toBe('https://vndb.org/r45775')
  })

  it('builds a getchu.com URL for a GC code, stripping the GC prefix', () => {
    expect(buildExternalUrl({ type: 'GC', value: 'GC1370494' })).toBe(
      'https://www.getchu.com/soft.phtml?id=1370494'
    )
  })
})
