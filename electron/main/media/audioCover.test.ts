import { describe, expect, it } from 'vitest'
import { COPYFILE_EXCL } from 'node:constants'
import {
  AudioCoverRestoreError,
  buildAudioCoverArgs,
  getAudioCoverWriteSupport,
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
    makeTempPath: () => 'D:\\Music\\Song.mp3.cover-work',
    makeBackupPath: () => 'D:\\Music\\Song.mp3.ark-cover-backup',
    ...overrides,
  }
}

describe('getAudioCoverWriteSupport', () => {
  it.each(['mp3', 'flac', 'm4a', 'wav', 'MP3'])(
    'supports cover embedding for .%s files',
    (extension) => {
      expect(getAudioCoverWriteSupport(`D:\\Music\\Song.${extension}`)).toBe('supported')
    }
  )

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

  it.each(['flac', 'm4a', 'wav'])(
    'marks the image as attached cover art for .%s files',
    (extension) => {
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
    }
  )
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

  it('restores backup when writing the work file fails', async () => {
    const calls: string[] = []
    const result = await writeAudioCoverWithBackup(
      'D:\\Music\\Song.flac',
      'D:\\Cover.jpg',
      createDeps(calls, {
        writeCover: async () => {
          calls.push('write')
          throw new Error('ffmpeg failed')
        },
      })
    )

    expect(result).toMatchObject({ ok: false, mode: 'override' })
    expect(calls).toContain('restore')
    expect(calls).toContain('delete-work')
    expect(calls).not.toContain('replace')
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
          return validationCount === 1
            ? playableAudio
            : { ...playableAudio, playable: false }
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
      'restore',
      'delete-work',
    ])
    expect(calls).not.toContain('delete-backup')
  })

  it('restores WAV and falls back when cover presence cannot be proven', async () => {
    const calls: string[] = []
    const result = await writeAudioCoverWithBackup(
      'D:\\Music\\Song.wav',
      'D:\\Cover.jpg',
      createDeps(calls, {
        validateAudio: async () => {
          calls.push('validate')
          return { ...playableAudio, hasCover: false }
        },
      })
    )

    expect(result).toMatchObject({ ok: false, mode: 'override' })
    expect(result.warning).toMatch(/WAV/i)
    expect(calls).toContain('restore')
    expect(calls).not.toContain('replace')
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
          throw new Error('disk write failed')
        },
      })
    )

    await expect(operation).rejects.toBeInstanceOf(AudioCoverRestoreError)
    expect(calls).toContain('delete-work')
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
