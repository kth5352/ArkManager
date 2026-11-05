// Secrets (currently only the optional external metadata API key) are stored
// encrypted with the OS (Windows DPAPI via Electron's safeStorage) instead of
// as plain text in the SQLite file, so a copied/backed-up/synced ark-manager.db
// does not leak them. The cipher is injected at startup so this module stays
// free of Electron imports (and unit-testable).

export interface SecretCipher {
  isAvailable(): boolean
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

const PREFIX = 'enc:v1:'
let cipher: SecretCipher | null = null

export function installSecretCipher(next: SecretCipher | null): void {
  cipher = next
}

export function isProtectedSecret(stored: string): boolean {
  return stored.startsWith(PREFIX)
}

/** Value to persist. Falls back to the plain value only when OS encryption is unavailable. */
export function protectSecret(plain: string): string {
  if (plain === '' || !cipher || !cipher.isAvailable()) return plain
  return PREFIX + cipher.encrypt(plain).toString('base64')
}

/** Value to use. Legacy plain-text values pass through; undecryptable ones become ''. */
export function revealSecret(stored: string): string {
  if (!isProtectedSecret(stored)) return stored
  if (!cipher || !cipher.isAvailable()) return ''
  try {
    return cipher.decrypt(Buffer.from(stored.slice(PREFIX.length), 'base64'))
  } catch {
    return ''
  }
}
