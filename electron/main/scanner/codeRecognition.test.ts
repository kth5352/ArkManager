import { describe, it, expect } from 'vitest'
import { extractCode } from './codeRecognition'

describe('extractCode', () => {
  it('recognizes an RJ code anywhere in the name', () => {
    expect(extractCode('[RJ01234567] 게임명.zip')).toEqual({ type: 'RJ', value: 'RJ01234567' })
  })

  it('recognizes a VJ code', () => {
    expect(extractCode('VJ009988 - Some Game')).toEqual({ type: 'VJ', value: 'VJ009988' })
  })

  it('recognizes an ST (Steam) code', () => {
    expect(extractCode('ST4282500')).toEqual({ type: 'ST', value: 'ST4282500' })
  })

  it('recognizes a VN (VNDB) code', () => {
    expect(extractCode('VN17 - Steins;Gate')).toEqual({ type: 'VN', value: 'VN17' })
  })

  it('extracts a VNDB visual novel id from a filename', () => {
    expect(extractCode('[v45775] Game')).toEqual({ type: 'VN', value: 'VN45775' })
  })

  it('extracts a VNDB release id from a filename without mapping it to VN', () => {
    expect(extractCode('[r45775] Game')).toEqual({ type: 'VR', value: 'VR45775' })
  })

  it('recognizes a GC (getchu) code', () => {
    expect(extractCode('GC1370494 - 何らかの作品')).toEqual({ type: 'GC', value: 'GC1370494' })
  })

  it('is case-insensitive but normalizes the prefix to uppercase', () => {
    expect(extractCode('rj01234567.zip')).toEqual({ type: 'RJ', value: 'RJ01234567' })
  })

  it('returns null when no code is present', () => {
    expect(extractCode('그냥 폴더 이름')).toBeNull()
  })

  it('returns null for a near-miss that is not actually a code (letters not immediately followed by digits)', () => {
    expect(extractCode('STAGE2_backup.txt')).toBeNull()
  })

  it('does not match a code embedded mid-word without a boundary', () => {
    expect(extractCode('COST1234.txt')).toBeNull()
  })

  it('recognizes a code immediately followed by an underscore (DLsite\'s own "code_title" convention)', () => {
    expect(extractCode('RJ01102860_타워 오브 헤븐 천사님에게서는 도망칠 수 없어!')).toEqual({
      type: 'RJ',
      value: 'RJ01102860',
    })
  })

  it('recognizes a code immediately preceded by an underscore', () => {
    expect(extractCode('작품명_RJ01102860.zip')).toEqual({ type: 'RJ', value: 'RJ01102860' })
  })

  it('recognizes a code in an asset filename joined by an underscore', () => {
    expect(extractCode('RJ01102860_bgm01.ogg')).toEqual({ type: 'RJ', value: 'RJ01102860' })
  })

  it('still rejects a code embedded mid-word when preceded by a letter directly (no underscore)', () => {
    expect(extractCode('XRJ0123')).toBeNull()
  })
})
