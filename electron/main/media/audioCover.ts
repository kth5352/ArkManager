import { execFile } from 'node:child_process'
import { COPYFILE_EXCL } from 'node:constants'
import { createReadStream } from 'node:fs'
import { copyFile, rm } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'
import { MEDIA_THUMBNAIL_RECOVERY_BACKUP_RETAINED_ERROR_MESSAGE } from '../../../shared/mediaThumbnailErrors'

const EMBEDDABLE_AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a'])
const FFMPEG_TIMEOUT_MS = 5 * 60 * 1000

export interface AudioValidation {
  playable: boolean
  hasAudioStream: boolean
  durationSeconds: number | null
  hasCover: boolean
}

export interface AudioCommandResult {
  stdout: string
  stderr: string
}

export type AudioCommandRunner = (args: string[]) => Promise<AudioCommandResult>

export type AudioCoverFailureStage =
  'embedding' | 'restore' | 'hash' | 'hash-mismatch' | 'backup-removal'

export interface AudioCoverDependencies {
  copyFile: (sourcePath: string, destinationPath: string, mode?: number) => Promise<void>
  writeCover: (filePath: string, imagePath: string, outputPath: string) => Promise<void>
  validateAudio: (filePath: string, referencePath: string) => Promise<AudioValidation>
  replaceFile: (sourcePath: string, destinationPath: string) => Promise<void>
  removeFile: (filePath: string) => Promise<void>
  restoreBackup: (backupPath: string, destinationPath: string) => Promise<void>
  hashFile: (filePath: string) => Promise<string>
  reportError: (stage: AudioCoverFailureStage, error: unknown, backupPath?: string) => void
  makeTempPath: (filePath: string) => string
  makeBackupPath: (filePath: string) => string
}

export type AudioCoverWriteResult =
  | { ok: true; mode: 'embedded'; warning?: string }
  | { ok: false; mode: 'override'; warning: string }

export class AudioCoverRestoreError extends Error {
  constructor(cause: unknown) {
    super(MEDIA_THUMBNAIL_RECOVERY_BACKUP_RETAINED_ERROR_MESSAGE, { cause })
    this.name = 'AudioCoverRestoreError'
  }
}

export function getAudioCoverWriteSupport(filePath: string): 'supported' | 'unsupported' {
  return EMBEDDABLE_AUDIO_EXTENSIONS.has(extname(filePath).toLowerCase())
    ? 'supported'
    : 'unsupported'
}

export function buildAudioCoverArgs(
  filePath: string,
  imagePath: string,
  outputPath: string
): string[] {
  if (getAudioCoverWriteSupport(filePath) === 'unsupported') {
    throw new Error('Unsupported audio cover format')
  }
  const extension = extname(filePath).toLowerCase()
  if (extension === '.mp3') {
    return [
      '-y',
      '-i',
      filePath,
      '-i',
      imagePath,
      '-map',
      '0:a',
      '-map',
      '1:v',
      '-c',
      'copy',
      '-id3v2_version',
      '3',
      outputPath,
    ]
  }
  return [
    '-y',
    '-i',
    filePath,
    '-i',
    imagePath,
    '-map',
    '0:a',
    '-map',
    '1:v',
    '-c',
    'copy',
    '-disposition:v:0',
    'attached_pic',
    outputPath,
  ]
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function parseProgressDuration(stdout: string): number | null {
  const microseconds = /(?:^|\r?\n)out_time_(?:us|ms)=(\d+)/g
  let latestMicroseconds: number | null = null
  for (const match of stdout.matchAll(microseconds)) {
    latestMicroseconds = Number(match[1])
  }
  if (latestMicroseconds !== null && Number.isFinite(latestMicroseconds)) {
    return latestMicroseconds / 1_000_000
  }

  const timestamps = /(?:^|\r?\n)out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/g
  let latestTimestamp: number | null = null
  for (const match of stdout.matchAll(timestamps)) {
    latestTimestamp = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  }
  return latestTimestamp !== null && Number.isFinite(latestTimestamp) ? latestTimestamp : null
}

async function probeAudio(
  filePath: string,
  runCommand: AudioCommandRunner
): Promise<{ hasAudioStream: boolean; durationSeconds: number | null }> {
  try {
    const result = await runCommand([
      '-v',
      'error',
      '-i',
      filePath,
      '-map',
      '0:a:0',
      '-progress',
      'pipe:1',
      '-nostats',
      '-f',
      'null',
      '-',
    ])
    return { hasAudioStream: true, durationSeconds: parseProgressDuration(result.stdout) }
  } catch {
    return { hasAudioStream: false, durationSeconds: null }
  }
}

async function probeCover(filePath: string, runCommand: AudioCommandRunner): Promise<boolean> {
  try {
    await runCommand([
      '-v',
      'error',
      '-i',
      filePath,
      '-map',
      '0:v:0',
      '-frames:v',
      '1',
      '-f',
      'null',
      '-',
    ])
    return true
  } catch {
    return false
  }
}

function durationsAreClose(
  durationSeconds: number | null,
  referenceSeconds: number | null
): boolean {
  if (durationSeconds === null || referenceSeconds === null || referenceSeconds <= 0) return false
  return Math.abs(durationSeconds - referenceSeconds) <= Math.max(1, referenceSeconds * 0.01)
}

export async function validateAudioWithFfmpeg(
  filePath: string,
  referencePath: string,
  runCommand: AudioCommandRunner
): Promise<AudioValidation> {
  const fileAudio = await probeAudio(filePath, runCommand)
  const hasCover = await probeCover(filePath, runCommand)
  const referenceAudio = await probeAudio(referencePath, runCommand)
  await probeCover(referencePath, runCommand)

  return {
    playable:
      fileAudio.hasAudioStream &&
      referenceAudio.hasAudioStream &&
      durationsAreClose(fileAudio.durationSeconds, referenceAudio.durationSeconds),
    hasAudioStream: fileAudio.hasAudioStream,
    durationSeconds: fileAudio.durationSeconds,
    hasCover,
  }
}

function runFfmpeg(args: string[]): Promise<AudioCommandResult> {
  const executablePath = ffmpegPath
  if (!executablePath) return Promise.reject(new Error('ffmpeg is unavailable'))
  return new Promise((resolve, reject) => {
    execFile(
      executablePath,
      args,
      { encoding: 'utf8', timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(error)
          return
        }
        resolve({ stdout, stderr })
      }
    )
  })
}

function createDefaultDependencies(): AudioCoverDependencies {
  return {
    copyFile: (sourcePath, destinationPath, mode) => copyFile(sourcePath, destinationPath, mode),
    writeCover: async (filePath, imagePath, outputPath) => {
      await runFfmpeg(buildAudioCoverArgs(filePath, imagePath, outputPath))
    },
    validateAudio: (filePath, referencePath) =>
      validateAudioWithFfmpeg(filePath, referencePath, runFfmpeg),
    replaceFile: async (sourcePath, destinationPath) => {
      await copyFile(sourcePath, destinationPath)
      await rm(sourcePath, { force: true })
    },
    removeFile: (filePath) => rm(filePath, { force: true }),
    restoreBackup: (backupPath, destinationPath) => copyFile(backupPath, destinationPath),
    hashFile: sha256File,
    reportError: (stage, error, backupPath) =>
      console.error(
        `[audio-cover] ${stage}${backupPath ? `; recovery backup: ${backupPath}` : ''}`,
        error
      ),
    makeTempPath: (filePath) => {
      const extension = extname(filePath)
      const stem = basename(filePath, extension)
      return join(dirname(filePath), `.${stem}.ark-cover-work-${randomUUID()}${extension}`)
    },
    makeBackupPath: (filePath) => `${filePath}.ark-cover-backup-${randomUUID()}`,
  }
}

function validationFailureWarning(): string {
  return 'Audio cover embedding could not be validated; the original file was restored and an app-local override will be used.'
}

const RECOVERY_BACKUP_RETAINED_WARNING =
  MEDIA_THUMBNAIL_RECOVERY_BACKUP_RETAINED_ERROR_MESSAGE

function isValidEmbeddedAudio(validation: AudioValidation): boolean {
  return (
    validation.playable &&
    validation.hasAudioStream &&
    validation.durationSeconds !== null &&
    validation.hasCover
  )
}

export async function writeAudioCoverWithBackup(
  filePath: string,
  imagePath: string,
  deps: AudioCoverDependencies = createDefaultDependencies()
): Promise<AudioCoverWriteResult> {
  if (getAudioCoverWriteSupport(filePath) === 'unsupported') {
    return {
      ok: false,
      mode: 'override',
      warning:
        'This audio format does not support embedded cover writes; an app-local override will be used.',
    }
  }

  const tempPath = deps.makeTempPath(filePath)
  const backupPath = deps.makeBackupPath(filePath)
  let backupCreated = false
  let hasValidationWarning = false
  let warning = 'Audio cover embedding failed; an app-local override will be used.'

  try {
    await deps.copyFile(filePath, backupPath, COPYFILE_EXCL)
    backupCreated = true
    await deps.writeCover(filePath, imagePath, tempPath)

    const candidateValidation = await deps.validateAudio(tempPath, filePath)
    if (!isValidEmbeddedAudio(candidateValidation)) {
      warning = validationFailureWarning()
      hasValidationWarning = true
      throw new Error('candidate validation failed')
    }

    await deps.replaceFile(tempPath, filePath)

    const finalValidation = await deps.validateAudio(filePath, backupPath)
    if (!isValidEmbeddedAudio(finalValidation)) {
      warning = validationFailureWarning()
      hasValidationWarning = true
      throw new Error('final validation failed')
    }

    await deps.removeFile(backupPath)
    return { ok: true, mode: 'embedded' }
  } catch (error) {
    deps.reportError('embedding', error, backupCreated ? backupPath : undefined)
    if (!hasValidationWarning) {
      warning = 'Audio cover embedding failed; an app-local override will be used.'
    }
    let restoreError: unknown
    if (backupCreated) {
      try {
        await deps.restoreBackup(backupPath, filePath)
      } catch (error) {
        restoreError = error
        deps.reportError('restore', error, backupPath)
      }
      if (restoreError === undefined) {
        let hashesMatch = false
        try {
          const [restoredHash, backupHash] = await Promise.all([
            deps.hashFile(filePath),
            deps.hashFile(backupPath),
          ])
          hashesMatch = restoredHash === backupHash
          if (!hashesMatch) {
            warning = RECOVERY_BACKUP_RETAINED_WARNING
            deps.reportError(
              'hash-mismatch',
              new Error('Restored audio hash did not match the recovery backup'),
              backupPath
            )
          }
        } catch (error) {
          warning = RECOVERY_BACKUP_RETAINED_WARNING
          deps.reportError('hash', error, backupPath)
        }
        if (hashesMatch) {
          try {
            await deps.removeFile(backupPath)
          } catch (error) {
            warning = RECOVERY_BACKUP_RETAINED_WARNING
            deps.reportError('backup-removal', error, backupPath)
          }
        }
      }
    }
    try {
      await deps.removeFile(tempPath)
    } catch {
      // Recovery status is more important than best-effort work-file cleanup.
    }
    if (restoreError !== undefined) throw new AudioCoverRestoreError(restoreError)
    return { ok: false, mode: 'override', warning }
  }
}
