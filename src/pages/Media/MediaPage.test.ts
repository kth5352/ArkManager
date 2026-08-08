import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranslationKey } from '../../i18n/translations'

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))

vi.mock('../../lib/appToast', () => ({ appToast: toastMocks }))

import { setMediaThumbnailWithFeedback } from './mediaThumbnailFeedback'

describe('setMediaThumbnailWithFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the retained-backup error toast when the fatal mutation rejects', async () => {
    const t = (key: TranslationKey): string => key
    const pickFile = vi.fn().mockResolvedValue('C:\\Pictures\\Cover.jpg')
    const setFromFile = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'media-thumbnail:set-from-file': Error: Audio cover update failed; the recovery backup was retained."
        )
      )

    await expect(
      setMediaThumbnailWithFeedback('D:\\Music\\Song.mp3', pickFile, setFromFile, t)
    ).resolves.toBeNull()

    expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith(
      'media.thumbnailRecoveryBackupRetained'
    )
    expect(toastMocks.success).not.toHaveBeenCalled()
    expect(toastMocks.info).not.toHaveBeenCalled()
  })
})
