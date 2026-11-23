import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  crawlDlsiteJsonFallback,
  dlsiteJsonUrls,
  mapDlsiteJsonToMetadata,
} from './dlsiteJsonFallback'

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
      workType: null,
    })
  })

  it('maps the live api/=/product.json shape (object image_main, datetime, work_type, custom genres)', async () => {
    const payload = JSON.parse(
      await readFile(join(__dirname, '__fixtures__', 'dlsite-product-api-response.json'), 'utf-8')
    )
    expect(mapDlsiteJsonToMetadata(payload[0])).toEqual({
      title:
        '【寝落ちASMR】悪魔娘が最高に癒すのでものすごく眠れる(耳かき・囁き・マッサージ・泡オイル)',
      circle: '周防パトラ',
      releaseDate: '2020-10-05',
      genres: [
        'ASMR',
        '癒し',
        '健全',
        'バイノーラル/ダミヘ',
        '萌え',
        '耳かき',
        'ささやき',
        'Vtuber本人出演作品',
      ],
      coverImageUrl:
        'https://img.dlsite.jp/modpub/images2/work/doujin/RJ300000/RJ299717_img_main.jpg',
      workType: 'SOU',
    })
  })

  it('requests the real api/=/product.json endpoint first', () => {
    expect(dlsiteJsonUrls({ type: 'RJ', value: 'RJ299717' })[0]).toBe(
      'https://www.dlsite.com/maniax/api/=/product.json?workno=RJ299717'
    )
    expect(dlsiteJsonUrls({ type: 'VJ', value: 'VJ01000460' })[0]).toBe(
      'https://www.dlsite.com/pro/api/=/product.json?workno=VJ01000460'
    )
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
