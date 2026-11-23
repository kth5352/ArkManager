// Opt-in native latency spike: node electron/native/mpv-addon/preview-latency.cjs <video>
// Measures preview-mode keyframe seek -> playback-restart -> first successful
// 240x135 renderFrame. Read-only media input; run on an idle machine.
const assert = require('node:assert/strict')
const path = require('node:path')
assert(process.argv[2], 'Usage: node preview-latency.cjs <video>')
process.env.PATH = `${__dirname};${process.env.PATH || ''}`
const addon = require(path.join(__dirname, 'build/Release/mpv_addon.node'))
const W = 240
const H = 135
const COUNT = 30
const TIMEOUT_MS = 60000
const samples = []
let loaded = false
let pending = null
let nextSeekAt = 0
const started = performance.now()
function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}
function finish(code) {
  clearInterval(interval)
  addon.shutdown()
  process.exitCode = code
}
assert.equal(
  addon.init(path.resolve(process.argv[2]), W, H, 'no', { preview: true }),
  'OK'
)
const interval = setInterval(() => {
  try {
    for (;;) {
      const event = addon.pollEvent()
      if (!event) break
      assert(!event.error, event.error)
      if (event.name === 'file-loaded') {
        loaded = true
        nextSeekAt = performance.now() + 300
      }
      if (event.name === 'playback-restart' && pending) pending.restarted = true
    }
    if (pending && pending.restarted && addon.renderFrame(W, H)) {
      samples.push(performance.now() - pending.start)
      pending = null
      nextSeekAt = performance.now() + 50
    }
    if (loaded && !pending && samples.length < COUNT && performance.now() >= nextSeekAt) {
      const duration = addon.getDuration()
      assert(duration > 1, 'Duration unavailable')
      const t = Math.random() * duration * 0.98
      pending = { start: performance.now(), restarted: false }
      assert.equal(addon.seek(t, 'keyframes'), 'OK')
    }
    if (samples.length === COUNT) {
      const sorted = [...samples].sort((a, b) => a - b)
      console.log(
        JSON.stringify({
          samples: COUNT,
          p50: +pct(sorted, 0.5).toFixed(1),
          p90: +pct(sorted, 0.9).toFixed(1),
          max: +sorted[sorted.length - 1].toFixed(1)
        })
      )
      finish(0)
    } else if (performance.now() - started > TIMEOUT_MS) {
      throw new Error(`Timed out after ${samples.length} samples`)
    }
  } catch (error) {
    console.error(error)
    finish(1)
  }
}, 4)
