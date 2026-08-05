import { describe, it, expect } from 'vitest'
import { encodeEucJpQuery } from './crawlGetchuSearch'

describe('encodeEucJpQuery', () => {
  it('encodes a Japanese query as EUC-JP percent-encoded bytes, not UTF-8', () => {
    // "恋" (koi/love) is a single EUC-JP double-byte character (0xCE 0xF8,
    // confirmed empirically via iconv-lite) - encodeURIComponent's UTF-8
    // encoding of the same character would be %E6%81%8B instead, which
    // getchu's server does not recognize as this query (verified live:
    // returns 0 results as UTF-8, 30 as EUC-JP).
    expect(encodeEucJpQuery('恋')).toBe('%CE%F8')
  })

  it('encodes ASCII queries identically to encodeURIComponent (byte-compatible in both encodings)', () => {
    expect(encodeEucJpQuery('sprite')).toBe('sprite')
  })

  it('percent-encodes URL metacharacters safely', () => {
    expect(encodeEucJpQuery('a&b=c')).toBe('a%26b%3Dc')
  })
})
