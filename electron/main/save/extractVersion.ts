// Same lookaround shape as codeRecognition.ts's extractCode: not preceded
// or followed by another digit. Limit segments to 3 digits to distinguish
// version numbers (e.g. 1.2.3, 1.10.0) from resolution strings (e.g.
// 1920.1080.999999). Punctuation, letters, underscores, or start/end of
// string are all acceptable around the match.
const VERSION_PATTERN = /(?<![0-9])(?:\d{1,3}\.){2}\d{1,3}(?![0-9])/

export function extractVersionFromName(name: string): string | null {
  const match = VERSION_PATTERN.exec(name)
  return match ? match[0] : null
}
