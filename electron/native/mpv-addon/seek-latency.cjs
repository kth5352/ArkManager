// Opt-in native regression: node electron/native/mpv-addon/seek-latency.cjs <video>
// Uses the real addon and a read-only media input. Run on an idle machine;
// not part of Vitest, since native render timing needs the bundled Windows DLL.
const assert = require('node:assert/strict')
const path = require('node:path')
assert(process.argv[2], 'Provide a local video at least 25 seconds long')
process.env.PATH = `${__dirname};${process.env.PATH || ''}`
const addon = require(path.join(__dirname, 'build/Release/mpv_addon.node'))
const targets = [12, 3, 20, 6, 16, 2]
const samples = []
const readTimes = []
const started = performance.now()
let pending = null
let index = 0
let frames = 0
let nextSeekAt = started + 1200
function read(name, fn) {
  const before = performance.now()
  const value = fn()
  readTimes.push({ name, ms: performance.now() - before })
  return value
}
assert.equal(addon.init(path.resolve(process.argv[2]), 640, 360, 'no'), 'OK')
addon.setVolume(0)
const interval = setInterval(() => {
  try {
    for (;;) {
      const event = addon.pollEvent()
      if (!event) break
      assert(!event.error, event.error)
      if (event.name === 'playback-restart' && pending) {
        samples.push({ target: pending.target, restartMs: performance.now() - pending.start })
        pending = null
        nextSeekAt = performance.now() + 700
      }
    }
    read('eof', () => addon.getEofReached())
    const frame = addon.renderFrame(640, 360)
    if (frame) frames++
    const position = read('time', () => addon.getTimePos())
    const duration = read('duration', () => addon.getDuration())
    if (index < targets.length && !pending && performance.now() >= nextSeekAt) {
      assert(duration > 25, 'Duration must become available through the event loop')
      assert(Number.isFinite(position), 'Playback time must become available')
      pending = { target: targets[index++], start: performance.now() }
      assert.equal(addon.seek(pending.target), 'OK')
    }
    if (index === targets.length && !pending) {
      assert.equal(samples.length, 6, 'Every seek must reach playback-restart')
      assert(frames > 20, 'Playback must continue rendering real frames')
      const slowestRead = readTimes.reduce((a, b) => (a.ms > b.ms ? a : b))
      console.log(JSON.stringify({ samples, slowestRead, frames }, null, 2))
      assert(
        slowestRead.ms < 100,
        `State reads blocked the rendering thread: ${slowestRead.name} ${slowestRead.ms.toFixed(1)}ms`
      )
      clearInterval(interval)
      addon.shutdown()
    } else if (performance.now() - started > 20000) {
      throw new Error('Timed out waiting for seek completion')
    }
  } catch (error) {
    clearInterval(interval)
    addon.shutdown()
    console.error(error)
    process.exitCode = 1
  }
}, 16)
