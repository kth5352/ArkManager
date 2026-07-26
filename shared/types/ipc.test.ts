import { describe, it, expect } from 'vitest'
import { GetSettingRequestSchema, SetSettingRequestSchema, ThemeSchema } from './ipc'

describe('ThemeSchema', () => {
  it('accepts light and dark', () => {
    expect(ThemeSchema.parse('light')).toBe('light')
    expect(ThemeSchema.parse('dark')).toBe('dark')
  })

  it('rejects anything else', () => {
    expect(() => ThemeSchema.parse('blue')).toThrow()
  })
})

describe('GetSettingRequestSchema', () => {
  it('accepts key "theme"', () => {
    expect(GetSettingRequestSchema.parse({ key: 'theme' })).toEqual({ key: 'theme' })
  })

  it('rejects an unknown key', () => {
    expect(() => GetSettingRequestSchema.parse({ key: 'nope' })).toThrow()
  })
})

describe('SetSettingRequestSchema', () => {
  it('accepts a key/value pair', () => {
    expect(SetSettingRequestSchema.parse({ key: 'theme', value: 'dark' })).toEqual({
      key: 'theme',
      value: 'dark',
    })
  })

  it('rejects a missing value', () => {
    expect(() => SetSettingRequestSchema.parse({ key: 'theme' })).toThrow()
  })
})
