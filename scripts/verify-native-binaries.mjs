// Supply-chain tripwire: binaries that ship inside the installer but are not
// built from this repository's source (libmpv-2.dll) must match the SHA-256
// recorded in electron/native/mpv-addon/CHECKSUMS.sha256. If someone (or some
// compromised tool) swaps the DLL, the build/release stops here.
//
// Update the checksum file deliberately, after verifying the new DLL against
// the official mpv/libmpv release you downloaded it from.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checksumFile = join(root, 'electron', 'native', 'mpv-addon', 'CHECKSUMS.sha256')

let failed = false
for (const line of readFileSync(checksumFile, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('#')) continue
  const match = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(trimmed)
  if (!match) {
    console.error(`Malformed checksum line: ${trimmed}`)
    failed = true
    continue
  }
  const [, expected, relativePath] = match
  let actual
  try {
    actual = createHash('sha256').update(readFileSync(join(root, relativePath))).digest('hex')
  } catch (error) {
    console.error(`Cannot read ${relativePath}: ${error.message}`)
    failed = true
    continue
  }
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    console.error(`CHECKSUM MISMATCH: ${relativePath}\n  expected ${expected}\n  actual   ${actual}`)
    failed = true
  } else {
    console.log(`ok  ${relativePath}`)
  }
}
process.exit(failed ? 1 : 0)
