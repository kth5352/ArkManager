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
