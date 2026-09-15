import { BrowserWindow, globalShortcut } from 'electron'
import { IPC_CHANNELS, type MediaHardwareKeyAction } from '../../shared/types/ipc'

// A live user found headset/keyboard hardware media keys (play/pause,
// next/previous track) dead after the libmpv migration. Before that
// migration, video/audio played through a real <video>/<audio> element,
// and Chromium wires OS-level hardware media keys to whatever element is
// actively playing automatically - no code needed. The migration replaced
// that element with a <canvas> fed raw decoded frames (video) and audio
// played entirely inside a separate mpv utility process, so Chromium's own
// audio-playing detection never fires and it never associates hardware
// keys with this app at all - not even the Web Media Session API
// (navigator.mediaSession, see useMediaPlayback.ts) reliably receives them
// in that state, since Chromium's OS media-key routing for that API still
// depends on Chromium itself believing a tab/window is currently audible.
//
// globalShortcut sidesteps all of that - it intercepts the key directly at
// the OS level, completely independent of Chromium's own audio pipeline.
// The tradeoff is that a registered global shortcut steals the key
// system-wide from every OTHER app for as long as it stays registered, so
// this is only ever registered while Ark Manager actually has a track
// loaded (see setMediaHardwareKeysActive's own caller in
// mediaWindowHandlers.ts) - otherwise a user with, say, Spotify also open
// would lose their headset controls to a library manager that isn't even
// playing anything.
let registered = false

// A live user found play/pause "repeating at an insane speed" the moment
// this shipped - some hardware (cheap headsets/USB DACs in particular)
// sends a continuous stream of duplicate HID reports for a single physical
// button press rather than one clean press+release, a quirk Chromium's own
// built-in media key handling normally absorbs internally. globalShortcut
// has no such debouncing of its own, so every duplicate report toggled
// playback again, producing the flicker. Tracked per action (not one
// shared timestamp) so a genuine rapid play/pause-then-next within the
// window isn't dropped just because an unrelated action fired recently.
const DEBOUNCE_MS = 300
const lastFiredAt = new Map<MediaHardwareKeyAction, number>()

function broadcast(action: MediaHardwareKeyAction): void {
  const now = Date.now()
  const last = lastFiredAt.get(action) ?? 0
  if (now - last < DEBOUNCE_MS) return
  lastFiredAt.set(action, now)

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send(IPC_CHANNELS.MEDIA_HARDWARE_KEY, action)
  }
}

// Idempotent either way - safe to call on every MEDIA_STATE_BROADCAST even
// when the requested state matches what's already registered.
export function setMediaHardwareKeysActive(active: boolean): void {
  if (active === registered) return
  registered = active
  if (active) {
    globalShortcut.register('MediaPlayPause', () => broadcast('playpause'))
    globalShortcut.register('MediaNextTrack', () => broadcast('nexttrack'))
    globalShortcut.register('MediaPreviousTrack', () => broadcast('previoustrack'))
  } else {
    globalShortcut.unregister('MediaPlayPause')
    globalShortcut.unregister('MediaNextTrack')
    globalShortcut.unregister('MediaPreviousTrack')
  }
}
