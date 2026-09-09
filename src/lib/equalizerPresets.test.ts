import { describe, expect, it } from 'vitest'
import {
  EQ_BAND_COUNT,
  EQ_BAND_FREQUENCIES_HZ,
  EQ_MAX_GAIN_DB,
  EQUALIZER_PRESETS,
  findEqualizerPresetMatchingGains,
} from './equalizerPresets'

describe('equalizerPresets', () => {
  it('every preset has exactly EQ_BAND_COUNT gains', () => {
    for (const preset of EQUALIZER_PRESETS) {
      expect(preset.gains.length).toBe(EQ_BAND_COUNT)
    }
  })

  it('EQ_BAND_FREQUENCIES_HZ has exactly EQ_BAND_COUNT entries', () => {
    expect(EQ_BAND_FREQUENCIES_HZ.length).toBe(EQ_BAND_COUNT)
  })

  it('every preset gain is within the +-EQ_MAX_GAIN_DB range', () => {
    for (const preset of EQUALIZER_PRESETS) {
      for (const gain of preset.gains) {
        expect(gain).toBeGreaterThanOrEqual(-EQ_MAX_GAIN_DB)
        expect(gain).toBeLessThanOrEqual(EQ_MAX_GAIN_DB)
      }
    }
  })

  it('findEqualizerPresetMatchingGains finds an exact match', () => {
    const flat = findEqualizerPresetMatchingGains([0, 0, 0, 0, 0])
    expect(flat?.id).toBe('flat')
  })

  it('findEqualizerPresetMatchingGains returns null for a custom (non-preset) combination', () => {
    const custom = findEqualizerPresetMatchingGains([1, 2, 3, 4, 5])
    expect(custom).toBeNull()
  })

  it('findEqualizerPresetMatchingGains returns null for gains longer than a preset', () => {
    // Without an explicit length check this matched 'flat': .every() only
    // walks the preset's own 5 gains and never sees the extra entry.
    expect(findEqualizerPresetMatchingGains([0, 0, 0, 0, 0, 7])).toBeNull()
  })

  it('findEqualizerPresetMatchingGains returns null for gains shorter than a preset', () => {
    expect(findEqualizerPresetMatchingGains([0, 0, 0])).toBeNull()
  })
})
