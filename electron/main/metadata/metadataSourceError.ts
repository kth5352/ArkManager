import type { MetadataFailureReason } from '../database/metadataFailuresRepository'

export type MetadataSourceFailureReason = Exclude<MetadataFailureReason, 'not_found'>

export class MetadataSourceError extends Error {
  readonly reason: MetadataSourceFailureReason

  constructor(reason: MetadataSourceFailureReason, message: string) {
    super(message)
    this.name = 'MetadataSourceError'
    this.reason = reason
  }
}

export function metadataFailureReasonFromError(
  error: unknown,
  fallback: MetadataSourceFailureReason
): MetadataSourceFailureReason {
  return error instanceof MetadataSourceError ? error.reason : fallback
}
