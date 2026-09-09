import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Button } from '../ui/button'
import { HoverTooltip } from '../ui/hover-tooltip'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'
import {
  EQ_BAND_FREQUENCIES_HZ,
  EQ_MAX_GAIN_DB,
  EQUALIZER_PRESETS,
  findEqualizerPresetMatchingGains,
} from '../../lib/equalizerPresets'
import { useMediaEqualizerQuery, useSetMediaEqualizerMutation } from '../../services/settingsService'

function formatBandFrequency(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}kHz` : `${hz}Hz`
}

interface EqualizerPopoverProps {
  dark?: boolean
  // Shrinks the trigger icon to match the repeat/shuffle/lyrics/volume
  // cluster it sits in - see MediaTransportBar's own `compact` prop.
  compact?: boolean
}

// Shared by the docked bar, fullscreen overlay, and detached window via
// MediaTransportBar. The two things the EQ actually drives - the persisted
// `media-equalizer-bands` setting and the single mpv session - are genuinely
// global, so every instance writes to the same place and the audible result
// is always consistent across windows.
//
// What is NOT shared is the in-memory TanStack Query cache: the detached
// player window is a separate renderer process with its own QueryClient, so a
// change made in one window does not push into the other's cache. The
// mitigation (not a full fix) is refetchOnWindowFocus on
// useMediaEqualizerQuery - see settingsService.ts - which re-reads the
// persisted value whenever a window regains focus, so the stale window
// self-corrects the moment the user actually goes to interact with it. The
// residual window is a window that is visible but unfocused, or one focused
// while its refetch is still in flight; a real fix would need a main-process
// broadcast of EQ changes to every renderer.
export function EqualizerPopover({ dark = false, compact = false }: EqualizerPopoverProps) {
  const { t } = useTranslation()
  const { data: gains } = useMediaEqualizerQuery()
  const setEqualizer = useSetMediaEqualizerMutation()

  // Same pattern as MediaTransportBar's seek-bar `dragValue`: the sliders are
  // controlled by query-cache data that only advances after the persistence
  // mutation's IPC round-trip resolves, so without a local drag value every
  // onChange tick would re-render showing the still-stale committed gain and
  // fight the drag. Only one slider is ever dragged at a time, so a single
  // {bandIndex, value} covers all five. Cleared in the mutation's onSettled
  // (not immediately on release) so the displayed value stays pinned to what
  // the user dragged to until the cache actually holds it - releasing on the
  // spot would flash the old value for the duration of the round-trip.
  const [dragState, setDragState] = useState<{ bandIndex: number; value: number } | null>(null)

  const currentGains = gains ?? EQUALIZER_PRESETS[0].gains
  // What the sliders and the preset Select both read from: the committed
  // gains with the in-progress drag applied on top. Deriving activePreset
  // from THIS (not from currentGains) is what keeps "a manual adjustment
  // clears the preset selection to custom" true during the drag itself,
  // rather than only after release.
  const displayGains = dragState
    ? currentGains.map((g, i) => (i === dragState.bandIndex ? dragState.value : g))
    : currentGains
  const activePreset = findEqualizerPresetMatchingGains(displayGains)

  const handlePresetSelect = (presetId: string): void => {
    const preset = EQUALIZER_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    const newGains = [...preset.gains]
    // A preset genuinely changes all five bands, so all five live calls are
    // real work here - unlike a single-band drag (see handleBandChange).
    newGains.forEach((gainDb, bandIndex) => {
      window.api.mpv.setEqualizerBandGain(bandIndex, gainDb)
    })
    setDragState(null)
    setEqualizer.mutate(newGains)
  }

  // Fires on every slider tick. The live mpv call stays here and stays
  // unbuffered (it's fire-and-forget and already glitch-free under rapid
  // calls - that responsiveness is the point), but it now sends ONLY the band
  // that actually changed instead of re-sending all five. The persistence
  // write is deferred to commitDrag below.
  const handleBandChange = (bandIndex: number, value: number): void => {
    setDragState({ bandIndex, value })
    window.api.mpv.setEqualizerBandGain(bandIndex, value)
  }

  // Mirrors the seek bar's commitDrag: the real (persisted) commit happens on
  // release, so a drag produces exactly one settings mutation instead of one
  // per tick - which also removes the out-of-order-onSuccess race that
  // concurrent per-tick mutations could otherwise lose a value to.
  //
  // onSettled clears dragState only if it's STILL this same drag - releasing
  // band 0 and immediately starting a drag on band 1 before band 0's mutation
  // settles would otherwise null out band 1's in-progress dragState from
  // band 0's callback, snapping band 1's slider back to its stale committed
  // value mid-drag and silently dropping its eventual commitDrag (it reads a
  // by-then-null dragState). The IPC+sqlite round-trip this closes is single-
  // digit milliseconds, so the window is a sub-5ms release-then-redrag - not
  // reachable with a mouse or keyboard, but free to guard against.
  const commitDrag = (): void => {
    if (!dragState) return
    const committed = dragState
    const newGains = [...currentGains]
    newGains[committed.bandIndex] = committed.value
    setEqualizer.mutate(newGains, {
      onSettled: () => setDragState((s) => (s === committed ? null : s)),
    })
  }

  const iconClass = dark
    ? 'text-white/70 transition-colors hover:text-white'
    : 'text-muted-foreground transition-colors hover:text-foreground'

  return (
    <Popover>
      <HoverTooltip content={t('media.equalizer')}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('media.equalizer')} className={cn('shrink-0', iconClass)}>
            <SlidersHorizontal className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
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
                  min={-EQ_MAX_GAIN_DB}
                  max={EQ_MAX_GAIN_DB}
                  step={1}
                  value={displayGains[bandIndex] ?? 0}
                  onChange={(e) => handleBandChange(bandIndex, Number(e.target.value))}
                  onPointerUp={commitDrag}
                  onKeyUp={commitDrag}
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
