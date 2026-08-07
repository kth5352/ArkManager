import { describe, expect, it, vi } from 'vitest'
import { crawlDlsiteJsonFallback, mapDlsiteJsonToMetadata } from './dlsiteJsonFallback'

describe('mapDlsiteJsonToMetadata', () => {
  it('maps product JSON data to CrawledGameMetadata', () => {
    expect(
      mapDlsiteJsonToMetadata({
        work_name: 'Title',
        maker_name: 'Circle',
        regist_date: '2024-01-02',
        genres: [{ name: 'ADV' }],
        image_main: '//img.dlsite.jp/modpub/images2/work/doujin/RJ000/RJ000001_img_main.jpg',
      })
    ).toEqual({
      title: 'Title',
      circle: 'Circle',
      releaseDate: '2024-01-02',
      genres: ['ADV'],
      coverImageUrl: 'https://img.dlsite.jp/modpub/images2/work/doujin/RJ000/RJ000001_img_main.jpg',
    })
  })

  it('rejects a payload without a product title', () => {
    expect(mapDlsiteJsonToMetadata({ maker_name: 'Circle' })).toBeNull()
  })
})

describe('crawlDlsiteJsonFallback', () => {
  it('continues to the next endpoint and maps a code-keyed response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            RJ01494021: {
              work_name: 'Fallback Title',
              maker_name: 'Fallback Circle',
              regist_date: '2024-01-02',
              genres: [],
              image_main: null,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

    await expect(
      crawlDlsiteJsonFallback(
        { type: 'RJ', value: 'RJ01494021' },
        fetchImpl as unknown as typeof fetch
      )
    ).resolves.toMatchObject({ title: 'Fallback Title' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('returns null only when every endpoint reports not found', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }))

    await expect(
      crawlDlsiteJsonFallback(
        { type: 'RJ', value: 'RJ01494021' },
        fetchImpl as unknown as typeof fetch
      )
    ).resolves.toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('reports network when all endpoints fail to fetch', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'))

    await expect(
      crawlDlsiteJsonFallback(
        { type: 'RJ', value: 'RJ01494021' },
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ name: 'MetadataSourceError', reason: 'network' })
  })

  it('reports blocked when the endpoints reject access', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 403 }))

    await expect(
      crawlDlsiteJsonFallback(
        { type: 'RJ', value: 'RJ01494021' },
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ name: 'MetadataSourceError', reason: 'blocked' })
  })

  it('reports parse when an endpoint returns malformed JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('{', { status: 200 }))

    await expect(
      crawlDlsiteJsonFallback(
        { type: 'RJ', value: 'RJ01494021' },
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ name: 'MetadataSourceError', reason: 'parse' })
  })

  it('reports parse when successful JSON does not match a product schema', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 })
    )

    await expect(
      crawlDlsiteJsonFallback(
        { type: 'RJ', value: 'RJ01494021' },
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ name: 'MetadataSourceError', reason: 'parse' })
  })
})
