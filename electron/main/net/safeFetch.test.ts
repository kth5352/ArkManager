import { describe, expect, it, vi } from 'vitest'
import {
  ResponseTooLargeError,
  UnsafeUrlError,
  assertSafeUrl,
  isPrivateAddress,
  safeFetch,
} from './safeFetch'

const publicLookup = async () => [{ address: '93.184.216.34' }]

describe('isPrivateAddress', () => {
  it('flags loopback, private, link-local, metadata, CGNAT, multicast', () => {
    for (const a of [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
      '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
      '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', 'ff02::1',
      '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', 'garbage',
    ]) {
      expect(isPrivateAddress(a), a).toBe(true)
    }
  })
  it('allows ordinary public addresses', () => {
    for (const a of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(a), a).toBe(false)
    }
  })
})

describe('assertSafeUrl', () => {
  it('rejects non-https, credentials, odd ports, internal names and private IPs', async () => {
    for (const u of [
      'http://example.com/', 'ftp://example.com/', 'file:///C:/x', 'javascript:1',
      'https://user:pw@example.com/', 'https://example.com:8443/',
      'https://localhost/', 'https://intranet/', 'https://printer.local/',
      'https://127.0.0.1/', 'https://169.254.169.254/latest', 'https://[::1]/',
      'https://192.168.0.1/', 'not a url',
    ]) {
      await expect(assertSafeUrl(u, { lookupImpl: publicLookup }), u).rejects.toBeInstanceOf(UnsafeUrlError)
    }
  })
  it('rejects a public-looking name that resolves to a private address', async () => {
    await expect(
      assertSafeUrl('https://evil.example.com/', { lookupImpl: async () => [{ address: '10.0.0.5' }] })
    ).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(
      assertSafeUrl('https://evil.example.com/', {
        lookupImpl: async () => [{ address: '93.184.216.34' }, { address: '127.0.0.1' }],
      })
    ).rejects.toBeInstanceOf(UnsafeUrlError)
  })
  it('accepts a normal https URL, and loopback http only when explicitly allowed', async () => {
    await expect(assertSafeUrl('https://img.example.com/a.jpg', { lookupImpl: publicLookup })).resolves.toBeInstanceOf(URL)
    await expect(assertSafeUrl('http://localhost:8080/x')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeUrl('http://localhost:8080/x', { allowLoopbackHttp: true })).resolves.toBeInstanceOf(URL)
    await expect(assertSafeUrl('http://192.168.0.1/x', { allowLoopbackHttp: true })).rejects.toBeInstanceOf(UnsafeUrlError)
  })
})

describe('safeFetch', () => {
  it('re-validates every redirect hop and refuses a hop into the LAN', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'https://192.168.0.1/admin' } })
    ) as unknown as typeof fetch
    await expect(
      safeFetch('https://example.com/a', { fetchImpl, lookupImpl: publicLookup })
    ).rejects.toBeInstanceOf(UnsafeUrlError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('follows a safe redirect and strips Authorization on cross-origin hops', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = []
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      calls.push({ url: String(url), headers: init.headers as Record<string, string> })
      if (calls.length === 1) return new Response(null, { status: 301, headers: { location: 'https://cdn.example.org/x' } })
      return new Response('ok')
    }) as unknown as typeof fetch
    const res = await safeFetch('https://example.com/a', {
      fetchImpl, lookupImpl: publicLookup, headers: { Authorization: 'Bearer secret', Accept: 'a' },
    })
    expect(await res.text()).toBe('ok')
    expect(calls[0].headers.Authorization).toBe('Bearer secret')
    expect(calls[1].headers.Authorization).toBeUndefined()
    expect(calls[1].headers.Accept).toBe('a')
  })

  it('stops after too many redirects', async () => {
    const fetchImpl = (async () =>
      new Response(null, { status: 302, headers: { location: 'https://example.com/loop' } })) as unknown as typeof fetch
    await expect(
      safeFetch('https://example.com/a', { fetchImpl, lookupImpl: publicLookup })
    ).rejects.toThrow(/redirect/i)
  })

  it('rejects an oversized declared Content-Length and an oversized streamed body', async () => {
    const declared = (async () =>
      new Response('x', { headers: { 'content-length': '999999' } })) as unknown as typeof fetch
    await expect(
      safeFetch('https://example.com/a', { fetchImpl: declared, lookupImpl: publicLookup, maxBytes: 1000 })
    ).rejects.toBeInstanceOf(ResponseTooLargeError)

    const streamed = (async () => new Response('y'.repeat(5000))) as unknown as typeof fetch
    const res = await safeFetch('https://example.com/a', { fetchImpl: streamed, lookupImpl: publicLookup, maxBytes: 1000 })
    await expect(res.arrayBuffer()).rejects.toBeInstanceOf(ResponseTooLargeError)
  })
})
