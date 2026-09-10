// Opt-in lifecycle regression using the real native addon:
// node electron/native/mpv-addon/playback-state.cjs <video >= 25s> [audio >= 2s]
// Local files are read-only. No app database or preferences are accessed.
const assert = require('node:assert/strict')
const path = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
assert(process.argv[2], 'Provide a local video at least 25 seconds long')
process.env.PATH = `${__dirname};${process.env.PATH || ''}`
const addon = require(path.join(__dirname, 'build/Release/mpv_addon.node'))
const video = path.resolve(process.argv[2])
let render = true
let frame = null

function tick() {
  for (;;) {
    const event = addon.pollEvent()
    if (!event) break
    assert(!event.error, event.error)
  }
  if (render) frame = addon.renderFrame(640, 360)
}

async function until(label, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    tick()
    if (predicate()) return
    await delay(render ? 16 : 250)
  }
  throw new Error(`Timed out: ${label}; time=${addon.getTimePos()}, eof=${addon.getEofReached()}`)
}

function assertCleared() {
  assert.equal(addon.getTimePos(), null, 'Old position must clear immediately on load')
  assert.equal(addon.getDuration(), null, 'Old duration must clear immediately on load')
  assert.equal(addon.getEofReached(), false, 'Old EOF must not leak into a new track')
}

async function run() {
  assert.equal(addon.init(video, 640, 360, 'no'), 'OK')
  addon.setVolume(0)
  assertCleared()
  await until(
    'initial playback',
    () => addon.getTimePos() > 0.1 && addon.getDuration() >= 25 && frame
  )
  const duration = addon.getDuration()
  assert.equal(addon.setPause(true), 'OK')
  // Let the pause settle before taking the pre-seek picture.
  await delay(100)
  tick()
  const before = Buffer.from(frame)
  assert.equal(addon.seek(12), 'OK')
  await until(
    'paused seek and repaint',
    () => Math.abs(addon.getTimePos() - 12) < 0.15 && frame && !frame.equals(before),
    1000
  )
  const pausedAt = addon.getTimePos()
  await delay(300)
  tick()
  assert(Math.abs(addon.getTimePos() - pausedAt) < 0.05, 'Seeking must leave playback paused')
  assert.equal(addon.getDuration(), duration)
  assert.equal(addon.setPause(false), 'OK')
  await until('resumed position updates', () => addon.getTimePos() > pausedAt + 0.1)

  assert.equal(addon.seek(duration - 0.2), 'OK')
  await until('natural EOF', () => addon.getEofReached())
  assert.equal(addon.seek(0), 'OK')
  assert.equal(addon.setPause(false), 'OK')
  await until('repeat after EOF', () => !addon.getEofReached() && addon.getTimePos() < 2)
  assert.equal(addon.seek(duration - 0.2), 'OK')
  await until('second natural EOF', () => addon.getEofReached())
  assert.equal(addon.loadFile(video), 'OK')
  assertCleared()
  assert.equal(addon.setPause(false), 'OK')
  await until(
    'reload after EOF',
    () => addon.getDuration() === duration && addon.getTimePos() > 0.1 && addon.getTimePos() < 2
  )
  assert.equal(addon.getEofReached(), false)

  if (process.argv[3]) {
    assert.equal(addon.loadFile(path.resolve(process.argv[3])), 'OK')
    assertCleared()
    render = false // Match the worker's audio-only 250ms polling, with no renders.
    addon.setPause(false)
    await until(
      'audio state without rendering',
      () => addon.getDuration() >= 2 && addon.getTimePos() > 0
    )
    assert.equal(addon.seek(addon.getDuration() - 0.2), 'OK')
    await until('audio EOF without rendering', () => addon.getEofReached())
    assert.equal(addon.loadFile(video), 'OK')
    assertCleared()
    render = true
    addon.setPause(false)
    await until(
      'audio to video',
      () => addon.getDuration() === duration && addon.getTimePos() > 0.1 && addon.getTimePos() < 2
    )
    assert.equal(addon.getEofReached(), false)
  }
  addon.shutdown()
  assertCleared()
  assert.equal(addon.init(video, 640, 360, 'no'), 'OK')
  addon.setVolume(0)
  assertCleared()
  await until(
    'fresh initialization',
    () => addon.getDuration() === duration && addon.getTimePos() > 0.1
  )
  console.log(
    'PASS: paused seek/repaint, resume, EOF, repeat, reload, shutdown/reinit' +
      (process.argv[3] ? ', audio-only state/EOF, audio-to-video' : '')
  )
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => addon.shutdown())
