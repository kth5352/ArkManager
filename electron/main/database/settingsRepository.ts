import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { appSettings } from './schema'
import type { SettingKey } from '../../../shared/types/ipc'
import { isProtectedSecret, protectSecret, revealSecret } from './secretStore'

// Settings whose value is a credential: encrypted at rest, transparently.
const SECRET_KEYS: ReadonlySet<SettingKey> = new Set<SettingKey>([
  'external-metadata-provider-api-key',
])

export function getSetting(db: AppDatabase, key: SettingKey): string | undefined {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
  if (row === undefined) return undefined
  return SECRET_KEYS.has(key) ? revealSecret(row.value) : row.value
}

export function setSetting(db: AppDatabase, key: SettingKey, plainValue: string): void {
  const value = SECRET_KEYS.has(key) ? protectSecret(plainValue) : plainValue
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run()
}

/** Re-saves any credential that is still stored as plain text (settings written by older versions). */
export function migrateSecretSettings(db: AppDatabase): void {
  for (const key of SECRET_KEYS) {
    const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
    if (row && row.value !== '' && !isProtectedSecret(row.value)) setSetting(db, key, row.value)
  }
}
