import { describe, expect, it, vi } from 'vitest'
import {
  crawlExternalMetadataProvider,
  mapExternalMetadataToMetadata,
} from './externalMetadataProvider'

describe('mapExternalMetadataToMetadata', () => {
  it('maps the narrow provider response contract', () => {
    expect(
      mapExternalMetadataToMetadata({
        title: 'External Title',
        circle: 'External Circle',
        releaseDate: '2024-01-02',
        genres: ['ADV'],
        coverImageUrl: 'https://example.test/cover.jpg',
      })
    ).toEqual({
      title: 'External Title',
      circle: 'External Circle',
      releaseDate: '2024-01-02',
      genres: ['ADV'],
      coverImageUrl: 'https://example.test/cover.jpg',
    })
  })
})

describe('crawlExternalMetadataProvider', () => {
  it('does not request a provider unless it is enabled and configured', async () => {
    const fetchImpl = vi.fn()

    await expect(
      crawlExternalMetadataProvider(
        { type: 'RJ', value: 'RJ01494021' },
        { enabled: false, endpointUrl: 'https://provider.example/metadata', apiKey: 'secret' },
        fetchImpl as unknown as typeof fetch
      )
    ).resolves.toBeNull()
    await expect(
      crawlExternalMetadataProvider(
        { type: 'RJ', value: 'RJ01494021' },
        { enabled: true, endpointUrl: '', apiKey: 'secret' },
        fetchImpl as unknown as typeof fetch
      )
    ).resolves.toBeNull()

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns null for a genuine provider not-found response', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }))

    await expect(
      crawlExternalMetadataProvider(
        { type: 'RJ', value: 'RJ01494021' },
        { enabled: true, endpointUrl: 'https://provider.example/metadata' },
        fetchImpl as unknown as typeof fetch
      )
    ).resolves.toBeNull()
  })

  it('reports provider_error for provider HTTP failures', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }))

    await expect(
      crawlExternalMetadataProvider(
        { type: 'RJ', value: 'RJ01494021' },
        { enabled: true, endpointUrl: 'https://provider.example/metadata' },
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ name: 'MetadataSourceError', reason: 'provider_error' })
  })

  it('reports provider_error for transport failures', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'))

    await expect(
      crawlExternalMetadataProvider(
        { type: 'RJ', value: 'RJ01494021' },
        { enabled: true, endpointUrl: 'https://provider.example/metadata' },
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ name: 'MetadataSourceError', reason: 'provider_error' })
  })

  it('reports provider_error for a response outside the provider schema', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 })
    )

    await expect(
      crawlExternalMetadataProvider(
        { type: 'RJ', value: 'RJ01494021' },
        { enabled: true, endpointUrl: 'https://provider.example/metadata' },
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ name: 'MetadataSourceError', reason: 'provider_error' })
  })

  it('rejects authenticated plain HTTP endpoints before sending credentials', async () => {
    const fetchImpl = vi.fn()

    await expect(
      crawlExternalMetadataProvider(
        { type: 'RJ', value: 'RJ01494021' },
        {
          enabled: true,
          endpointUrl: 'http://provider.example/metadata',
          apiKey: 'secret',
        },
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ name: 'MetadataSourceError', reason: 'provider_error' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('permits plain HTTP for an explicitly configured loopback provider', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            title: 'Local Title',
            circle: '',
            releaseDate: '',
            genres: [],
            coverImageUrl: null,
          }),
          { status: 200 }
        )
    )

    await expect(
      crawlExternalMetadataProvider(
        { type: 'RJ', value: 'RJ01494021' },
        {
          enabled: true,
          endpointUrl: 'http://127.0.0.1:8787/metadata',
          apiKey: 'secret',
        },
        fetchImpl as unknown as typeof fetch
      )
    ).resolves.toMatchObject({ title: 'Local Title' })
  })

  it('uses a structured URL and bearer token for an enabled provider', async () => {
    const fetchImpl = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              title: 'External Title',
              circle: '',
              releaseDate: '',
              genres: [],
              coverImageUrl: null,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
    )

    await expect(
      crawlExternalMetadataProvider(
        { type: 'VJ', value: 'VJ123456' },
        {
          enabled: true,
          endpointUrl: 'https://provider.example/metadata?locale=ja',
          apiKey: 'secret',
        },
        fetchImpl as unknown as typeof fetch
      )
    ).resolves.toMatchObject({ title: 'External Title' })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url.toString()).toBe('https://provider.example/metadata?locale=ja&code=VJ123456')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret' })
  })
})
