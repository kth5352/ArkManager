import { open } from 'node:fs/promises'

// MPEG-TS packets are always exactly 188 bytes, each starting with the sync
// byte 0x47. Checking for that byte alone at offset 0 would false-positive
// on any file that merely happens to start with 0x47 (ASCII 'G', hardly
// rare) - requiring it to repeat at the 188-byte stride for several packets
// in a row is what actually distinguishes a genuine MPEG-TS stream from a
// coincidence or a real ISO-BMFF file (which starts with a box-size/'ftyp'
// header instead).
const TS_PACKET_SIZE = 188
const MIN_SYNC_PACKETS = 4
const PROBE_LENGTH = TS_PACKET_SIZE * MIN_SYNC_PACKETS

export async function isLikelyMpegTsStream(filePath: string): Promise<boolean> {
  let handle
  try {
    handle = await open(filePath, 'r')
  } catch {
    return false
  }
  try {
    const buffer = Buffer.alloc(PROBE_LENGTH)
    const { bytesRead } = await handle.read(buffer, 0, PROBE_LENGTH, 0)
    if (bytesRead < PROBE_LENGTH) return false
    for (let i = 0; i < MIN_SYNC_PACKETS; i++) {
      if (buffer[i * TS_PACKET_SIZE] !== 0x47) return false
    }
    return true
  } catch {
    // A directory opens successfully but throws EISDIR on read - callers
    // (resolvePlayableMediaPath, via buildMediaResponse) rely on this
    // function never throwing for an unreadable path, the same way it
    // already treats a missing file as "not MPEG-TS" rather than an error.
    return false
  } finally {
    await handle.close()
  }
}
