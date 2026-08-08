import type { SetMediaThumbnailFromFileResult } from '../../../shared/types/ipc'
import type { TranslationKey } from '../../i18n/translations'
import { isMediaThumbnailRecoveryBackupRetainedError } from '../../../shared/mediaThumbnailErrors'
import { appToast } from '../../lib/appToast'

export async function setMediaThumbnailWithFeedback(
  filePath: string,
  pickFile: () => Promise<string | null>,
  setFromFile: (payload: {
    filePath: string
    sourcePath: string
  }) => Promise<SetMediaThumbnailFromFileResult>,
  t: (key: TranslationKey) => string
): Promise<SetMediaThumbnailFromFileResult | null> {
  try {
    const sourcePath = await pickFile()
    if (!sourcePath) return null
    const result = await setFromFile({ filePath, sourcePath })
    appToast.success(t('media.thumbnailSet'))
    if (result.warning) appToast.info(result.warning)
    return result
  } catch (error) {
    appToast.error(
      t(
        isMediaThumbnailRecoveryBackupRetainedError(error)
          ? 'media.thumbnailRecoveryBackupRetained'
          : 'media.thumbnailSetFailed'
      )
    )
    return null
  }
}
