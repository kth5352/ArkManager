import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

// 원본 이미지를 받아 webp로 변환해 cacheDir/{code}.webp에 저장한다. 게임
// 파일이 위치한 경로와는 완전히 분리된 디렉터리에만 쓴다 - 호출자가
// app.getPath('userData')/cache/covers 같은 캐시 전용 경로를 넘겨야 한다.
export async function cacheCoverImage(
  cacheDir: string,
  code: string,
  imageUrl: string
): Promise<string | null> {
  try {
    const response = await fetch(imageUrl)
    if (!response.ok) return null

    const buffer = Buffer.from(await response.arrayBuffer())
    const outputPath = join(cacheDir, `${code}.webp`)
    await mkdir(cacheDir, { recursive: true })
    await sharp(buffer).webp().toFile(outputPath)
    return outputPath
  } catch {
    return null
  }
}
