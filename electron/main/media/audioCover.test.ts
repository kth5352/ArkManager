import { describe, expect, it } from 'vitest'
import { COPYFILE_EXCL } from 'node:constants'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AudioCoverRestoreError,
  buildAudioCoverArgs,
  getAudioCoverWriteSupport,
  sha256File,
  validateAudioWithFfmpeg,
  writeAudioCoverWithBackup,
  type AudioCommandRunner,
  type AudioCoverDependencies,
  type AudioValidation,
} from './audioCover'

const playableAudio: AudioValidation = {
  playable: true,
  hasAudioStream: true,
  durationSeconds: 120,
  hasCover: true,
}

function createDeps(
  calls: string[],
  overrides: Partial<AudioCoverDependencies> = {}
): AudioCoverDependencies {
  return {
    copyFile: async () => {
      calls.push('backup')
    },
    writeCover: async () => {
      calls.push('write')
    },
    validateAudio: async () => {
      calls.push('validate')
      return playableAudio
    },
    replaceFile: async () => {
      calls.push('replace')
    },
    removeFile: async (filePath) => {
      calls.push(filePath.includes('cover-work') ? 'delete-work' : 'delete-backup')
    },
    restoreBackup: async () => {
      calls.push('restore')
    },
    hashFile: async () => {
      calls.push('hash')
      return 'same-sha256'
    },
    reportError: () => {
      calls.push('report-error')
    },
    makeTempPath: (filePath) => `${filePath}.cover-work`,
    makeBackupPath: (filePath) => `${filePath}.ark-cover-backup`,
    ...overrides,
  }
}

describe('getAudioCoverWriteSupport', () => {
  it.each(['mp3', 'flac', 'm4a', 'MP3'])('supports cover embedding for .%s files', (extension) => {
    expect(getAudioCoverWriteSupport(`D:\\Music\\Song.${extension}`)).toBe('supported')
  })

  it('routes WAV through an app-local override', () => {
    expect(getAudioCoverWriteSupport('D:\\Music\\Song.wav')).toBe('unsupported')
  })

  it('rejects audio formats outside the supported write set', () => {
    expect(getAudioCoverWriteSupport('D:\\Music\\Song.ogg')).toBe('unsupported')
  })
})

describe('buildAudioCoverArgs', () => {
  it('builds MP3 cover arguments without a shell command string', () => {
    expect(
      buildAudioCoverArgs(
        'D:\\Music\\Song.mp3',
        'D:\\Cover art\\Cover.jpg',
        'D:\\Music\\Song.mp3.cover-work'
      )
    ).toEqual([
      '-y',
      '-i',
      'D:\\Music\\Song.mp3',
      '-i',
      'D:\\Cover art\\Cover.jpg',
      '-map',
      '0:a',
      '-map',
      '1:v',
      '-c',
      'copy',
      '-id3v2_version',
      '3',
      'D:\\Music\\Song.mp3.cover-work',
    ])
  })

  it.each(['flac', 'm4a'])('marks the image as attached cover art for .%s files', (extension) => {
    expect(
      buildAudioCoverArgs(
        `D:\\Music\\Song.${extension}`,
        'D:\\Cover.jpg',
        `D:\\Music\\Song.${extension}.cover-work`
      )
    ).toEqual([
      '-y',
      '-i',
      `D:\\Music\\Song.${extension}`,
      '-i',
      'D:\\Cover.jpg',
      '-map',
      '0:a',
      '-map',
      '1:v',
      '-c',
      'copy',
      '-disposition:v:0',
      'attached_pic',
      `D:\\Music\\Song.${extension}.cover-work`,
    ])
  })

  it('rejects unsupported formats', () => {
    expect(() =>
      buildAudioCoverArgs('D:\\Music\\Song.wav', 'D:\\Cover.jpg', 'D:\\Music\\work.wav')
    ).toThrow(/unsupported/i)
  })
})

describe('sha256File', () => {
  it('streams a file into a SHA-256 digest', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ark-manager-audio-cover-'))
    const filePath = join(directory, 'audio.bin')
    try {
      await writeFile(filePath, 'Ark Manager')
      await expect(sha256File(filePath)).resolves.toBe(
        '5c6a6dca2167f8f1851a00a16091ffa792a0d474bd59d5fb4ebf4053324d6cf7'
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('validateAudioWithFfmpeg', () => {
  it('proves audio playability, close duration, and embedded cover presence', async () => {
    const calls: string[][] = []
    const runCommand: AudioCommandRunner = async (args) => {
      calls.push(args)
      const filePath = args[3]
      if (args.includes('0:v:0')) return { stdout: '', stderr: '' }
      const durationUs = filePath.endsWith('.cover-work') ? '120000000' : '120400000'
      return { stdout: `out_time_us=${durationUs}\nprogress=end\n`, stderr: '' }
    }

    const result = await validateAudioWithFfmpeg(
      'D:\\Music\\Song.mp3.cover-work',
      'D:\\Music\\Song.mp3',
      runCommand
    )

    expect(result).toEqual({
      playable: true,
      hasAudioStream: true,
      durationSeconds: 120,
      hasCover: true,
    })
    expect(calls).toHaveLength(4)
    expect(calls.every((args) => Array.isArray(args))).toBe(true)
  })

  it('rejects a candidate whose duration is not close to the reference', async () => {
    const runCommand: AudioCommandRunner = async (args) => {
      if (args.includes('0:v:0')) return { stdout: '', stderr: '' }
      const durationUs = args[3].endsWith('.cover-work') ? '110000000' : '120000000'
      return { stdout: `out_time_us=${durationUs}\nprogress=end\n`, stderr: '' }
    }

    const result = await validateAudioWithFfmpeg(
      'D:\\Music\\Song.flac.cover-work',
      'D:\\Music\\Song.flac',
      runCommand
    )

    expect(result.playable).toBe(false)
    expect(result.hasAudioStream).toBe(true)
    expect(result.durationSeconds).toBe(110)
  })

  it('reports missing cover art without treating playable audio as broken', async () => {
    const runCommand: AudioCommandRunner = async (args) => {
      if (args.includes('0:v:0')) throw new Error('stream map matches no streams')
      return { stdout: 'out_time_us=120000000\nprogress=end\n', stderr: '' }
    }

    const result = await validateAudioWithFfmpeg(
      'D:\\Music\\Song.wav.cover-work',
      'D:\\Music\\Song.wav',
      runCommand
    )

    expect(result).toEqual({
      playable: true,
      hasAudioStream: true,
      durationSeconds: 120,
      hasCover: false,
    })
  })
})

describe('writeAudioCoverWithBackup', () => {
  it('backs up, writes, validates, replaces, and deletes backup on success', async () => {
    const calls: string[] = []
    const validationPairs: Array<[string, string]> = []
    const result = await writeAudioCoverWithBackup(
      'D:\\Music\\Song.mp3',
      'D:\\Cover.jpg',
      createDeps(calls, {
        validateAudio: async (filePath, referencePath) => {
          calls.push('validate')
          validationPairs.push([filePath, referencePath])
          return playableAudio
        },
      })
    )

    expect(result).toEqual({ ok: true, mode: 'embedded' })
    expect(calls).toEqual(['backup', 'write', 'validate', 'replace', 'validate', 'delete-backup'])
    expect(validationPairs).toEqual([
      ['D:\\Music\\Song.mp3.cover-work', 'D:\\Music\\Song.mp3'],
      ['D:\\Music\\Song.mp3', 'D:\\Music\\Song.mp3.ark-cover-backup'],
    ])
  })

  it('restores backup when candidate validation fails', async () => {
    const calls: string[] = []
    const result = await writeAudioCoverWithBackup(
      'D:\\Music\\Song.mp3',
      'D:\\Cover.jpg',
      createDeps(calls, {
        validateAudio: async () => {
          calls.push('validate')
          return {
            playable: false,
            hasAudioStream: false,
            durationSeconds: null,
            hasCover: false,
          }
        },
      })
    )

    expect(result.ok).toBe(false)
    expect(result.mode).toBe('override')
    expect(result.warning).toBeTruthy()
    expect(calls).toContain('restore')
    expect(calls).not.toContain('replace')
  })

  it('deletes the backup after a failed write is restored and hash-verified', async () => {
    const calls: string[] = []
    const result = await writeAudioCoverWithBackup(
      'D:\\Music\\Song.flac',
      'D:\\Cover.jpg',
      createDeps(calls, {
        writeCover: async () => {
          calls.push('write')
          throw new Error('full ffmpeg command and stderr')
        },
        hashFile: async () => {
          calls.push('hash')
          return 'same-sha256'
        },
      })
    )

    expect(result).toMatchObject({ ok: false, mode: 'override' })
    expect(result.warning).not.toContain('ffmpeg command')
    expect(calls).toEqual([
      'backup',
      'write',
      'report-error',
      'restore',
      'hash',
      'hash',
      'delete-backup',
      'delete-work',
    ])
  })

  it('retains the backup when restored source and backup hashes differ', async () => {
    const calls: string[] = []
    const diagnostics: Array<{ stage: string; error: unknown; backupPath?: string }> = []
    let hashCall = 0
    const result = await writeAudioCoverWithBackup(
      'D:\\Music\\Song.m4a',
      'D:\\Cover.jpg',
      createDeps(calls, {
        writeCover: async () => {
          calls.push('write')
          throw new Error('ffmpeg failed')
        },
        hashFile: async () => (++hashCall === 1 ? 'source-hash' : 'backup-hash'),
        reportError: (stage, error, backupPath) => {
          diagnostics.push({ stage, error, backupPath })
        },
      })
    )

    expect(result.warning).toBe('Audio cover update failed; the recovery backup was retained.')
    expect(calls).not.toContain('delete-backup')
    expect(diagnostics).toContainEqual({
      stage: 'hash-mismatch',
      error: expect.any(Error),
      backupPath: 'D:\\Music\\Song.m4a.ark-cover-backup',
    })
  })

  it('retains the backup and reports its path when hashing rejects', async () => {
    const calls: string[] = []
    const hashError = new Error('EPERM while reading recovery file')
    const diagnostics: Array<{ stage: string; error: unknown; backupPath?: string }> = []
    const result = await writeAudioCoverWithBackup(
      'D:\\Music\\Song.flac',
      'D:\\Cover.jpg',
      createDeps(calls, {
        writeCover: async () => {
          calls.push('write')
          throw new Error('ffmpeg -i private-file stderr details')
        },
        hashFile: async () => {
          throw hashError
        },
        reportError: (stage, error, backupPath) => {
          diagnostics.push({ stage, error, backupPath })
        },
      })
    )

    expect(result).toEqual({
      ok: false,
      mode: 'override',
      warning: 'Audio cover update failed; the recovery backup was retained.',
    })
    expect(calls).not.toContain('delete-backup')
    expect(diagnostics).toContainEqual({
      stage: 'hash',
      error: hashError,
      backupPath: 'D:\\Music\\Song.flac.ark-cover-backup',
    })
  })

  it('retains the backup and reports its path when verified-backup removal fails', async () => {
    const calls: string[] = []
    const removeError = new Error('EPERM deleting recovery backup')
    const diagnostics: Array<{ stage: string; error: unknown; backupPath?: string }> = []
    let backupRetained = true
    const result = await writeAudioCoverWithBackup(
      'D:\\Music\\Song.mp3',
      'D:\\Cover.jpg',
      createDeps(calls, {
        writeCover: async () => {
          calls.push('write')
          throw new Error('ffmpeg failed')
        },
        removeFile: async (filePath) => {
          calls.push(filePath.includes('cover-work') ? 'delete-work' : 'delete-backup')
          if (!filePath.includes('cover-work')) throw removeError
          backupRetained = true
        },
        reportError: (stage, error, backupPath) => {
          diagnostics.push({ stage, error, backupPath })
        },
      })
    )

    expect(result.warning).toBe('Audio cover update failed; the recovery backup was retained.')
    expect(backupRetained).toBe(true)
    expect(diagnostics).toContainEqual({
      stage: 'backup-removal',
      error: removeError,
      backupPath: 'D:\\Music\\Song.mp3.ark-cover-backup',
    })
  })

  it('restores backup when the replaced file fails final validation', async () => {
    const calls: string[] = []
    let validationCount = 0
    const result = await writeAudioCoverWithBackup(
      'D:\\Music\\Song.m4a',
      'D:\\Cover.jpg',
      createDeps(calls, {
        validateAudio: async () => {
          calls.push('validate')
          validationCount += 1
          return validationCount === 1 ? playableAudio : { ...playableAudio, playable: false }
        },
      })
    )

    expect(result).toMatchObject({ ok: false, mode: 'override' })
    expect(calls).toEqual([
      'backup',
      'write',
      'validate',
      'replace',
      'validate',
      'report-error',
      'restore',
      'hash',
      'hash',
      'delete-backup',
      'delete-work',
    ])
  })

  it('does not create WAV work or backup files', async () => {
    const calls: string[] = []
    const result = await writeAudioCoverWithBackup(
      'D:\\Music\\Song.wav',
      'D:\\Cover.jpg',
      createDeps(calls, {})
    )

    expect(result).toMatchObject({ ok: false, mode: 'override' })
    expect(calls).toEqual([])
  })

  it('does not overwrite a retained recovery backup when a retry collides', async () => {
    const calls: string[] = []
    let retainedBackup = 'known-good-audio'
    const result = await writeAudioCoverWithBackup(
      'D:\\Music\\Song.mp3',
      'D:\\Cover.jpg',
      createDeps(calls, {
        copyFile: async (_sourcePath, _backupPath, mode) => {
          calls.push('backup')
          if (mode === COPYFILE_EXCL) {
            throw Object.assign(new Error('backup already exists'), { code: 'EEXIST' })
          }
          retainedBackup = 'damaged-audio'
        },
        removeFile: async (filePath) => {
          calls.push(filePath.includes('cover-work') ? 'delete-work' : 'delete-backup')
          if (!filePath.includes('cover-work')) retainedBackup = ''
        },
      })
    )

    expect(result).toMatchObject({ ok: false, mode: 'override' })
    expect(retainedBackup).toBe('known-good-audio')
    expect(calls).not.toContain('write')
    expect(calls).not.toContain('restore')
  })

  it('rejects fatally when restoring the backup fails', async () => {
    const calls: string[] = []
    const restoreError = new Error('ffmpeg command and stderr must stay in main')
    const diagnostics: Array<{ stage: string; error: unknown; backupPath?: string }> = []
    const operation = writeAudioCoverWithBackup(
      'D:\\Music\\Song.flac',
      'D:\\Cover.jpg',
      createDeps(calls, {
        validateAudio: async () => {
          calls.push('validate')
          return { ...playableAudio, playable: false }
        },
        restoreBackup: async () => {
          calls.push('restore')
          throw restoreError
        },
        reportError: (stage, error, backupPath) => {
          diagnostics.push({ stage, error, backupPath })
        },
      })
    )

    const error = await operation.catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AudioCoverRestoreError)
    expect(error).toMatchObject({
      message: 'Audio cover update failed; the recovery backup was retained.',
    })
    expect((error as Error).message).not.toContain('ffmpeg command')
    expect(diagnostics).toContainEqual({
      stage: 'restore',
      error: restoreError,
      backupPath: 'D:\\Music\\Song.flac.ark-cover-backup',
    })
    expect(calls).toContain('delete-work')
    expect(calls).not.toContain('hash')
  })

  it('does not mask ordinary recovery when work-file cleanup fails', async () => {
    const calls: string[] = []
    const result = await writeAudioCoverWithBackup(
      'D:\\Music\\Song.m4a',
      'D:\\Cover.jpg',
      createDeps(calls, {
        writeCover: async () => {
          calls.push('write')
          throw new Error('ffmpeg failed')
        },
        removeFile: async () => {
          calls.push('delete-work')
          throw new Error('cleanup failed')
        },
      })
    )

    expect(result).toMatchObject({ ok: false, mode: 'override' })
    expect(calls).toContain('restore')
    expect(calls).toContain('delete-work')
  })
})
