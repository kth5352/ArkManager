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
})
