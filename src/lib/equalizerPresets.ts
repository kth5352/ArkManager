import type { TranslationKey } from '../i18n/translations'

// 5-band EQ - frequencies must match electron/native/mpv-addon/mpv_addon.cc's
// Init() exactly (60/230/910/3000/14000 Hz, in this order - band index N here
// is mpv's `eqN` filter label).
export const EQ_BAND_COUNT = 5

export const EQ_BAND_FREQUENCIES_HZ: readonly number[] = [60, 230, 910, 3000, 14000]

export interface EqualizerPreset {
  id: string
  labelKey: TranslationKey
  gains: readonly number[]
}

// Gains are dB, one per band, in EQ_BAND_FREQUENCIES_HZ order. Values chosen
// as reasonable, conservative examples - none exceed the +-12dB range the
// UI/schema enforce elsewhere.
export const EQUALIZER_PRESETS: readonly EqualizerPreset[] = [
  { id: 'flat', labelKey: 'media.equalizerPresetFlat', gains: [0, 0, 0, 0, 0] },
  { id: 'bass-boost', labelKey: 'media.equalizerPresetBassBoost', gains: [6, 4, 0, 0, 0] },
  { id: 'vocal-boost', labelKey: 'media.equalizerPresetVocalBoost', gains: [-2, 0, 4, 3, 0] },
  { id: 'treble-boost', labelKey: 'media.equalizerPresetTrebleBoost', gains: [0, 0, 0, 3, 6] },
]

export function findEqualizerPresetMatchingGains(
  gains: readonly number[]
): EqualizerPreset | null {
  return (
    EQUALIZER_PRESETS.find((preset) => preset.gains.every((g, i) => g === gains[i])) ?? null
  )
}
