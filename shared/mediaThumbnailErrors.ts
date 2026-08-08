export const MEDIA_THUMBNAIL_RECOVERY_BACKUP_RETAINED_ERROR_MESSAGE =
  'Audio cover update failed; the recovery backup was retained.'

export function isMediaThumbnailRecoveryBackupRetainedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes(MEDIA_THUMBNAIL_RECOVERY_BACKUP_RETAINED_ERROR_MESSAGE)
  )
}
