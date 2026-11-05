import { afterEach, describe, expect, it } from 'vitest'
import { createDbClient } from './client'
import { appSettings } from './schema'
import { getSetting, migrateSecretSettings, setSetting } from './settingsRepository'
import { installSecretCipher } from './secretStore'

const fakeCipher = {
  isAvailable: () => true,
  encrypt: (plain: string) => Buffer.from(plain, 'utf8').reverse(),
  decrypt: (data: Buffer) => Buffer.from(data).reverse().toString('utf8'),
}

afterEach(() => installSecretCipher(null))

describe('secret settings are encrypted at rest', () => {
  it('stores the API key encrypted but reads it back transparently', () => {
    installSecretCipher(fakeCipher)
    const db = createDbClient(':memory:')
    setSetting(db, 'external-metadata-provider-api-key', 'sk-very-secret')

    const raw = db.select().from(appSettings).all().find((r) => r.key === 'external-metadata-provider-api-key')
    expect(raw?.value.startsWith('enc:v1:')).toBe(true)
    expect(raw?.value).not.toContain('sk-very-secret')
    expect(getSetting(db, 'external-metadata-provider-api-key')).toBe('sk-very-secret')
    db.$client.close()
  })

  it('leaves ordinary settings untouched', () => {
    installSecretCipher(fakeCipher)
    const db = createDbClient(':memory:')
    setSetting(db, 'theme', 'dark')
    expect(db.select().from(appSettings).all().find((r) => r.key === 'theme')?.value).toBe('dark')
    db.$client.close()
  })

  it('migrates a legacy plain-text value and still reads it', () => {
    const db = createDbClient(':memory:')
    setSetting(db, 'external-metadata-provider-api-key', 'legacy-key') // no cipher yet: plain
    installSecretCipher(fakeCipher)
    migrateSecretSettings(db)

    const raw = db.select().from(appSettings).all().find((r) => r.key === 'external-metadata-provider-api-key')
    expect(raw?.value.startsWith('enc:v1:')).toBe(true)
    expect(getSetting(db, 'external-metadata-provider-api-key')).toBe('legacy-key')
    db.$client.close()
  })

  it('returns an empty string (not garbage) when the ciphertext cannot be decrypted', () => {
    installSecretCipher(fakeCipher)
    const db = createDbClient(':memory:')
    setSetting(db, 'external-metadata-provider-api-key', 'abc')
    installSecretCipher(null) // e.g. profile moved to another machine
    expect(getSetting(db, 'external-metadata-provider-api-key')).toBe('')
    db.$client.close()
  })
})
