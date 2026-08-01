import { describe, it, expect } from 'vitest'
import {
  GetSettingRequestSchema,
  RestoreSaveSnapshotRequestSchema,
  SaveDiffRequestSchema,
  SetSettingRequestSchema,
  ThemeSchema,
} from './ipc'

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

  it('accepts any string value (per-key validation, e.g. theme, happens at the read path)', () => {
    expect(SetSettingRequestSchema.safeParse({ key: 'theme', value: 'chartreuse' }).success).toBe(
      true
    )
  })

  it('accepts key "sidebar-width"', () => {
    expect(SetSettingRequestSchema.parse({ key: 'sidebar-width', value: '400' })).toEqual({
      key: 'sidebar-width',
      value: '400',
    })
  })
})

describe('RestoreSaveSnapshotRequestSchema', () => {
  const identifier = { code: null, path: 'D:\\Games\\SomeGame' }

  it('accepts a timestamp shaped like timestampToDirName output', () => {
    expect(
      RestoreSaveSnapshotRequestSchema.safeParse({
        identifier,
        timestamp: '2026-08-01T14-53-10-699Z',
      }).success
    ).toBe(true)
  })

  it('rejects a timestamp containing path-escaping segments', () => {
    expect(
      RestoreSaveSnapshotRequestSchema.safeParse({
        identifier,
        timestamp: '../../../../Windows',
      }).success
    ).toBe(false)
  })

  it('rejects an arbitrary string that is not a valid snapshot timestamp', () => {
    expect(
      RestoreSaveSnapshotRequestSchema.safeParse({ identifier, timestamp: 'not-a-timestamp' })
        .success
    ).toBe(false)
  })
})

describe('SaveDiffRequestSchema', () => {
  const identifier = { code: null, path: 'D:\\Games\\SomeGame' }

  it('accepts a null timestamp (diff against the live save with no snapshot)', () => {
    expect(SaveDiffRequestSchema.safeParse({ identifier, timestamp: null }).success).toBe(true)
  })

  it('rejects a timestamp containing path-escaping segments', () => {
    expect(
      SaveDiffRequestSchema.safeParse({ identifier, timestamp: '../../../../Windows' }).success
    ).toBe(false)
  })
})
