import { describe, it, expect } from 'vitest'
import { relativePath } from './relativePath'

describe('relativePath', () => {
  it('strips the root and leading separator for a direct child', () => {
    expect(relativePath('D:\\games', 'D:\\games\\SomeGame\\file.zip')).toBe('SomeGame\\file.zip')
  })

  it('handles a root with a trailing separator', () => {
    expect(relativePath('D:\\games\\', 'D:\\games\\SomeGame\\file.zip')).toBe('SomeGame\\file.zip')
  })

  it('returns the full path unchanged if it does not start with the root', () => {
    expect(relativePath('D:\\games', 'E:\\other\\file.zip')).toBe('E:\\other\\file.zip')
  })

  it('returns an empty string when the path equals the root', () => {
    expect(relativePath('D:\\games', 'D:\\games')).toBe('')
  })

  it('does not treat a sibling folder sharing a literal prefix as a descendant', () => {
    expect(relativePath('D:\\game', 'D:\\games\\file.zip')).toBe('D:\\games\\file.zip')
  })

  it('matches even when root uses forward slashes and fullPath uses backslashes', () => {
    expect(relativePath('D:/games', 'D:\\games\\SomeGame\\file.zip')).toBe('SomeGame\\file.zip')
  })

  it('matches when root uses forward slashes with a trailing slash', () => {
    expect(relativePath('D:/games/', 'D:\\games\\SomeGame\\file.zip')).toBe('SomeGame\\file.zip')
  })

  it('still rejects a sibling folder sharing a literal prefix when separators differ', () => {
    expect(relativePath('D:/game', 'D:\\games\\file.zip')).toBe('D:\\games\\file.zip')
  })
})
