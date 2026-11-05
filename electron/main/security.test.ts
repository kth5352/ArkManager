import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: true, on: vi.fn() },
  ipcMain: {},
  session: {},
}))

import { isTrustedAppUrl, secureWebPreferences } from './security'

const packaged = {
  rendererFile: 'C:/Program Files/Ark Manager/resources/app.asar/out/renderer/index.html',
}
const dev = { rendererDevUrl: 'http://localhost:5173/', rendererFile: 'C:/x/index.html' }

describe('isTrustedAppUrl', () => {
  it('accepts the packaged renderer file with any hash route', () => {
    expect(
      isTrustedAppUrl(
        'file:///C:/Program%20Files/Ark%20Manager/resources/app.asar/out/renderer/index.html#/player-window',
        packaged
      )
    ).toBe(true)
  })

  it('rejects other files, remote hosts, UNC, and non-file schemes when packaged', () => {
    for (const url of [
      'file:///C:/Users/me/evil.html',
      'file://attacker/share/index.html',
      'https://example.com/',
      'http://localhost:5173/',
      'data:text/html,<script>1</script>',
      'about:blank',
      'javascript:alert(1)',
      'not a url',
      '',
    ]) {
      expect(isTrustedAppUrl(url, packaged), url).toBe(false)
    }
  })

  it('in dev only trusts the dev server origin', () => {
    expect(isTrustedAppUrl('http://localhost:5173/#/media', dev)).toBe(true)
    expect(isTrustedAppUrl('http://localhost:5174/', dev)).toBe(false)
    expect(isTrustedAppUrl('https://localhost:5173/', dev)).toBe(false)
    expect(isTrustedAppUrl('http://evil.test/', dev)).toBe(false)
  })
})

describe('secureWebPreferences', () => {
  it('pins the security-relevant switches', () => {
    const prefs = secureWebPreferences('/p.js')
    expect(prefs).toMatchObject({
      preload: '/p.js',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
    })
  })
})
