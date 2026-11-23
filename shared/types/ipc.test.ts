import { describe, it, expect } from 'vitest'
import {
  GetSettingRequestSchema,
  GameCodeSchema,
  MpvPreviewFrameRequestSchema,
  RestoreSaveSnapshotRequestSchema,
  SaveDiffRequestSchema,
  SetSettingRequestSchema,
  SettingKeySchema,
  ThemeSchema,
  WindowCloseBehaviorSchema,
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

describe('WindowCloseBehaviorSchema', () => {
  it('accepts the supported window close behaviors', () => {
    expect(WindowCloseBehaviorSchema.parse('ask')).toBe('ask')
    expect(WindowCloseBehaviorSchema.parse('quit')).toBe('quit')
    expect(WindowCloseBehaviorSchema.parse('tray')).toBe('tray')
  })

  it('rejects unsupported window close behaviors', () => {
    expect(() => WindowCloseBehaviorSchema.parse('hide')).toThrow()
  })
})

describe('GameCodeSchema', () => {
  it('accepts VNDB release codes', () => {
    expect(GameCodeSchema.parse({ type: 'VNR', value: 'VNR45775' })).toEqual({
      type: 'VNR',
      value: 'VNR45775',
    })
  })

  it('rejects legacy VNDB prefixes', () => {
    expect(() => GameCodeSchema.parse({ type: 'VN', value: 'VN45775' })).toThrow()
    expect(() => GameCodeSchema.parse({ type: 'VR', value: 'VR45775' })).toThrow()
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

describe('SettingKeySchema', () => {
  it('accepts the window close behavior setting key', () => {
    expect(SettingKeySchema.parse('window-close-behavior')).toBe('window-close-behavior')
  })

  it('accepts external metadata provider setting keys', () => {
    expect(SettingKeySchema.parse('external-metadata-provider-enabled')).toBe(
      'external-metadata-provider-enabled'
    )
    expect(SettingKeySchema.parse('external-metadata-provider-url')).toBe(
      'external-metadata-provider-url'
    )
    expect(SettingKeySchema.parse('external-metadata-provider-api-key')).toBe(
      'external-metadata-provider-api-key'
    )
  })
})

describe('MpvPreviewFrameRequestSchema', () => {
  const valid = { seconds: 12.5, generation: 3, requestId: 7 }

  it('accepts a finite non-negative time with integer generation and request id', () => {
    expect(MpvPreviewFrameRequestSchema.parse(valid)).toEqual(valid)
    expect(MpvPreviewFrameRequestSchema.parse({ seconds: 0, generation: 0, requestId: 0 })).toEqual(
      { seconds: 0, generation: 0, requestId: 0 }
    )
  })

  it('rejects negative, NaN and infinite seconds', () => {
    for (const seconds of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => MpvPreviewFrameRequestSchema.parse({ ...valid, seconds })).toThrow()
    }
  })

  it('rejects non-integer or negative generation and request id', () => {
    expect(() => MpvPreviewFrameRequestSchema.parse({ ...valid, generation: 1.5 })).toThrow()
    expect(() => MpvPreviewFrameRequestSchema.parse({ ...valid, generation: -1 })).toThrow()
    expect(() => MpvPreviewFrameRequestSchema.parse({ ...valid, requestId: 0.5 })).toThrow()
    expect(() => MpvPreviewFrameRequestSchema.parse({ ...valid, requestId: -2 })).toThrow()
  })

  it('rejects a smuggled file path instead of stripping it', () => {
    expect(() => MpvPreviewFrameRequestSchema.parse({ ...valid, path: 'C:/evil.mp4' })).toThrow()
    expect(() =>
      MpvPreviewFrameRequestSchema.parse({ ...valid, filePath: 'C:/evil.mp4' })
    ).toThrow()
  })

  it('rejects a missing field', () => {
    expect(() => MpvPreviewFrameRequestSchema.parse({ seconds: 1, generation: 1 })).toThrow()
  })
})
