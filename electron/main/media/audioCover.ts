import { execFile } from 'node:child_process'
import { copyFile, rm } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'

const EMBEDDABLE_AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.wav'])
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

export interface AudioCoverDependencies {
  copyFile: (sourcePath: string, destinationPath: string) => Promise<void>
  writeCover: (filePath: string, imagePath: string, outputPath: string) => Promise<void>
  validateAudio: (filePath: string, referencePath: string) => Promise<AudioValidation>
  replaceFile: (sourcePath: string, destinationPath: string) => Promise<void>
  removeFile: (filePath: string) => Promise<void>
  restoreBackup: (backupPath: string, destinationPath: string) => Promise<void>
  makeTempPath: (filePath: string) => string
  makeBackupPath: (filePath: string) => string
}

export type AudioCoverWriteResult =
  | { ok: true; mode: 'embedded'; warning?: string }
  | { ok: false; mode: 'override'; warning: string }

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

function durationsAreClose(durationSeconds: number | null, referenceSeconds: number | null): boolean {
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
    copyFile,
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
    makeTempPath: (filePath) => {
      const extension = extname(filePath)
      const stem = basename(filePath, extension)
      return join(dirname(filePath), `.${stem}.ark-cover-work-${randomUUID()}${extension}`)
    },
    makeBackupPath: (filePath) => `${filePath}.ark-cover-backup`,
  }
}

function validationFailureWarning(filePath: string, validation: AudioValidation): string {
  if (extname(filePath).toLowerCase() === '.wav' && !validation.hasCover) {
    return 'WAV cover embedding could not be verified; the original file was restored and an app-local override will be used.'
  }
  return 'Audio cover embedding could not be validated; the original file was restored and an app-local override will be used.'
}

function isValidEmbeddedAudio(validation: AudioValidation): boolean {
  return (
    validation.playable &&
    validation.hasAudioStream &&
    validation.durationSeconds !== null &&
    validation.hasCover
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Unknown error'
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
      warning: 'This audio format does not support embedded cover writes; an app-local override will be used.',
    }
  }

  const tempPath = deps.makeTempPath(filePath)
  const backupPath = deps.makeBackupPath(filePath)
  let backupCreated = false
  let hasValidationWarning = false
  let warning = 'Audio cover embedding failed; an app-local override will be used.'

  try {
    await deps.copyFile(filePath, backupPath)
    backupCreated = true
    await deps.writeCover(filePath, imagePath, tempPath)

    const candidateValidation = await deps.validateAudio(tempPath, filePath)
    if (!isValidEmbeddedAudio(candidateValidation)) {
      warning = validationFailureWarning(filePath, candidateValidation)
      hasValidationWarning = true
      throw new Error('candidate validation failed')
    }

    await deps.replaceFile(tempPath, filePath)

    const finalValidation = await deps.validateAudio(filePath, backupPath)
    if (!isValidEmbeddedAudio(finalValidation)) {
      warning = validationFailureWarning(filePath, finalValidation)
      hasValidationWarning = true
      throw new Error('final validation failed')
    }

    await deps.removeFile(backupPath)
    return { ok: true, mode: 'embedded' }
  } catch (error) {
    if (!hasValidationWarning) {
      warning = `Audio cover embedding failed (${errorMessage(error)}); an app-local override will be used.`
    }
    if (backupCreated) {
      try {
        await deps.restoreBackup(backupPath, filePath)
      } catch (restoreError) {
        warning = `${warning} Backup restoration also failed: ${errorMessage(restoreError)}`
      }
    }
    return { ok: false, mode: 'override', warning }
  }
}
