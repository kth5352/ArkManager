// Same lookaround shape as codeRecognition.ts's extractCode: not preceded
// or followed by another digit. Limit segments to 1-4 digits to distinguish
// real version numbers (e.g. 1.2.3, 1.10.0, 2024.11.1) from resolution-style
// strings with much longer trailing runs (e.g. 1920.1080.999999, where the
// 6-digit "999999" ensures no valid 3-segment window exists). Punctuation,
// letters, underscores, or start/end of string are all acceptable around
// the match.
const VERSION_PATTERN = /(?<![0-9])(?:\d{1,4}\.){2}\d{1,4}(?![0-9])/

export function extractVersionFromName(name: string): string | null {
  const match = VERSION_PATTERN.exec(name)
  return match ? match[0] : null
}
