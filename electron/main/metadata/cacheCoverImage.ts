import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'
import { keyToSafeDirName } from '../save/keyToSafeDirName'

// Same reasoning as crawlGameMetadata.ts's NETWORK_TIMEOUT_MS - an
// unresponsive image host would otherwise hang this fetch (and the awaiting
// METADATA_CRAWL_AND_SAVE handler) indefinitely.
const NETWORK_TIMEOUT_MS = 15_000

// 원본 이미지를 받아 webp로 변환해 cacheDir/{code}.webp에 저장한다. 게임
// 파일이 위치한 경로와는 완전히 분리된 디렉터리에만 쓴다 - 호출자가
// app.getPath('userData')/cache/covers 같은 캐시 전용 경로를 넘겨야 한다.
export async function cacheCoverImage(
  cacheDir: string,
  code: string,
  imageUrl: string
): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) })
    if (!response.ok) return null

    const buffer = Buffer.from(await response.arrayBuffer())
    // code is always a validated GameCode.value (e.g. "RJ01234567") in the
    // one real caller today, so this is a no-op in practice - but nothing at
    // this function's own boundary enforced that. keyToSafeDirName already
    // solves the identical problem for save-backup folder names (reject
    // path-traversal segments like "../../etc" by hashing anything that
    // isn't a bare-safe filename), so reuse it here instead of trusting the
    // caller.
    const outputPath = join(cacheDir, `${keyToSafeDirName(code)}.webp`)
    await mkdir(cacheDir, { recursive: true })
    await sharp(buffer).webp().toFile(outputPath)
    return outputPath
  } catch {
    return null
  }
}
