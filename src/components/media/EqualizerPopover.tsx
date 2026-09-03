import { SlidersHorizontal } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Button } from '../ui/button'
import { HoverTooltip } from '../ui/hover-tooltip'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'
import {
  EQ_BAND_FREQUENCIES_HZ,
  EQUALIZER_PRESETS,
  findEqualizerPresetMatchingGains,
} from '../../lib/equalizerPresets'
import { useMediaEqualizerQuery, useSetMediaEqualizerMutation } from '../../services/settingsService'

function formatBandFrequency(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}kHz` : `${hz}Hz`
}

interface EqualizerPopoverProps {
  dark?: boolean
}

// Shared by the docked bar, fullscreen overlay, and detached window via
// MediaTransportBar - EQ is a global mpv-session setting (not per-window),
// so rendering this in all three places is correct and requires no extra
// cross-window sync: every instance reads/writes the exact same persisted
// setting and drives the exact same mpv session.
export function EqualizerPopover({ dark = false }: EqualizerPopoverProps) {
  const { t } = useTranslation()
  const { data: gains } = useMediaEqualizerQuery()
  const setEqualizer = useSetMediaEqualizerMutation()

  const currentGains = gains ?? EQUALIZER_PRESETS[0].gains
  const activePreset = findEqualizerPresetMatchingGains(currentGains)

  const applyGains = (newGains: number[]): void => {
    setEqualizer.mutate(newGains)
    newGains.forEach((gainDb, bandIndex) => {
      window.api.mpv.setEqualizerBandGain(bandIndex, gainDb)
    })
  }

  const handlePresetSelect = (presetId: string): void => {
    const preset = EQUALIZER_PRESETS.find((p) => p.id === presetId)
    if (preset) applyGains([...preset.gains])
  }

  const handleBandChange = (bandIndex: number, value: number): void => {
    const newGains = [...currentGains]
    newGains[bandIndex] = value
    applyGains(newGains)
  }

  const iconClass = dark
    ? 'text-white/70 transition-colors hover:text-white'
    : 'text-muted-foreground transition-colors hover:text-foreground'

  return (
    <Popover>
      <HoverTooltip content={t('media.equalizer')}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('media.equalizer')} className={cn('shrink-0', iconClass)}>
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
      </HoverTooltip>
      <PopoverContent>
        <div className="flex flex-col gap-4">
          {/* value="" (not undefined) when nothing matches a preset - Radix
              Select treats an undefined `value` as "go uncontrolled", which
              would stop reflecting later controlled updates correctly. An
              empty string is a safe sentinel since no real preset id is ever
              empty, and SelectValue falls back to the placeholder whenever
              the current value doesn't match any SelectItem, empty string
              included. */}
          <Select value={activePreset?.id ?? ''} onValueChange={handlePresetSelect}>
            <SelectTrigger>
              <SelectValue placeholder={t('media.equalizerCustom')} />
            </SelectTrigger>
            <SelectContent>
              {EQUALIZER_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {t(preset.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-end justify-between gap-2">
            {EQ_BAND_FREQUENCIES_HZ.map((hz, bandIndex) => (
              <div key={hz} className="flex flex-col items-center gap-2">
                {/* Plain <input type="range"> with writing-mode: vertical-lr
                    (the standard Chromium trick for a vertical range input,
                    reliable here since Electron is always Chromium) rather
                    than the shared Slider UI component (src/components/ui/
                    slider.tsx) - that component's Track/Thumb Tailwind classes
                    are hardcoded for horizontal layout (h-2 w-full etc.), so
                    passing Radix's orientation="vertical" prop through it
                    would change the ARIA/keyboard behavior correctly but NOT
                    the visual layout, silently rendering a squished-looking,
                    wrongly-styled control. Raw <input type="range"> also
                    matches this file's OWN existing convention - the seek bar
                    and volume slider above already use it, not the Slider
                    component. direction: rtl keeps min-at-bottom/max-at-top
                    (Chromium's default vertical-lr range otherwise runs
                    bottom-to-top in the wrong direction for a gain slider). */}
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={currentGains[bandIndex] ?? 0}
                  onChange={(e) => handleBandChange(bandIndex, Number(e.target.value))}
                  className="h-32 w-4"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                />
                <span className="text-[10px] text-muted-foreground">{formatBandFrequency(hz)}</span>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
