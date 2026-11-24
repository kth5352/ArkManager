import { useEffect, useState, type CSSProperties } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'

// The frameless detached player window's own minimize / maximize / close
// buttons. They fade with the control bands (2s auto-hide) and, like them,
// hold the bands open while hovered or keyboard-focused.
const NO_DRAG_STYLE = { WebkitAppRegion: 'no-drag' } as CSSProperties

interface DetachedWindowControlsProps {
  visible: boolean
  // Maximizing makes no sense while fullscreen: only minimize/close remain.
  fullscreen: boolean
  onPointerOverChange: (over: boolean) => void
  onFocusInChange: (focused: boolean) => void
}

const buttonClass =
  'flex h-8 w-10 items-center justify-center text-white/70 transition-colors hover:bg-white/15 hover:text-white focus-visible:bg-white/15 focus-visible:text-white focus-visible:outline-none'

export function DetachedWindowControls({
  visible,
  fullscreen,
  onPointerOverChange,
  onFocusInChange,
}: DetachedWindowControlsProps) {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const off = window.api.window.onMaximizedChanged(setMaximized)
    void window.api.window
      .control('get-state')
      .then((r) => setMaximized(r.maximized))
      .catch(() => {})
    return off
  }, [])

  return (
    <div
      data-window-controls
      className={cn(
        'absolute top-2 right-2 z-20 flex overflow-hidden rounded-md bg-black/45 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
      style={NO_DRAG_STYLE}
      onPointerEnter={() => onPointerOverChange(true)}
      onPointerLeave={() => onPointerOverChange(false)}
      onFocus={() => onFocusInChange(true)}
      onBlur={() => onFocusInChange(false)}
    >
      <button
        type="button"
        className={buttonClass}
        aria-label={t('media.windowMinimize')}
        title={t('media.windowMinimize')}
        onClick={() => void window.api.window.control('minimize')}
      >
        <Minus className="h-4 w-4" />
      </button>
      {!fullscreen && (
        <button
          type="button"
          className={buttonClass}
          aria-label={maximized ? t('media.windowRestore') : t('media.windowMaximize')}
          title={maximized ? t('media.windowRestore') : t('media.windowMaximize')}
          onClick={() =>
            void window.api.window.control('toggle-maximize').then((r) => setMaximized(r.maximized))
          }
        >
          {maximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </button>
      )}
      <button
        type="button"
        className={cn(buttonClass, 'hover:bg-red-600 hover:text-white focus-visible:bg-red-600')}
        aria-label={t('media.windowClose')}
        title={t('media.windowClose')}
        onClick={() => void window.api.window.control('close')}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
