import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { appSettings } from './schema'

export function getSetting(db: AppDatabase, key: string): string | undefined {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
  return row?.value
}

export function setSetting(db: AppDatabase, key: string, value: string): void {
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run()
}
