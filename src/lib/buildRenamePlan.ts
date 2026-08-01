export interface RenameTarget {
  name: string
  kind: 'file' | 'folder'
  // Crawled DLsite metadata, when available - undefined/null fields fall
  // back to an empty substitution (or {name} for {title}) rather than
  // leaving the literal token text in the result.
  code?: string | null
  circle?: string | null
  title?: string | null
  genres?: string[]
}

export interface RenamePlanEntry {
  oldName: string
  newName: string
}

function splitExtension(name: string, kind: 'file' | 'folder'): { base: string; ext: string } {
  if (kind === 'folder') return { base: name, ext: '' }
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex <= 0) return { base: name, ext: '' }
  return { base: name.slice(0, dotIndex), ext: name.slice(dotIndex) }
}

// The default bulk-rename pattern offered in the UI (RenameDialog) - a
// common "코드 [서클명] 제목 {태그1, 태그2}.확장명" layout built entirely from
// crawled DLsite metadata plus the filename-derived extension.
export const DEFAULT_RENAME_PATTERN = '{code} [{circle}] {title} {genres}'

// Bulk-rename only - a single-target rename lets the user type the exact
// final name directly (see RenameDialog), since auto-appending the original
// extension here would double it up whenever that single typed name already
// includes one of its own.
//
// Tokens: {name} (original name, extension stripped for files), {ext}
// (original extension including the dot, empty for folders), {index}
// (1-based position), {index:N} (1-based, zero-padded to N digits), {code}
// (game code, e.g. RJ01234567), {circle} (crawled circle name), {title}
// (crawled title, falls back to {name} if not crawled yet), {genres} (the
// first 3 crawled genre tags, rendered as "{tag1, tag2, tag3}" including the
// braces - a code-less or not-yet-crawled entry substitutes an empty
// string, not the braces; capped at 3 rather than every tag DLsite lists,
// since a game can carry a dozen+ and the filename would otherwise balloon
// past what's actually useful for skimming a file listing). A file whose
// pattern omits {ext} keeps its original extension
// appended automatically, matching the common "batch rename" expectation
// that a short pattern like "Game {index}" doesn't strip every file's
// extension.
export function buildRenamePlan(targets: RenameTarget[], pattern: string): RenamePlanEntry[] {
  const usesExtToken = pattern.includes('{ext}')

  return targets.map((target, i) => {
    const { base, ext } = splitExtension(target.name, target.kind)
    const index = i + 1
    const genresText = target.genres?.length ? `{${target.genres.slice(0, 3).join(', ')}}` : ''
    let newName = pattern
      .replace(/\{name\}/g, base)
      .replace(/\{index:(\d+)\}/g, (_match, digits: string) =>
        String(index).padStart(Number(digits), '0')
      )
      .replace(/\{index\}/g, String(index))
      .replace(/\{code\}/g, target.code ?? '')
      .replace(/\{circle\}/g, target.circle ?? '')
      .replace(/\{title\}/g, target.title ?? base)
      .replace(/\{genres\}/g, genresText)
      .replace(/\{ext\}/g, ext)
      // Missing metadata (e.g. no circle crawled) leaves behind runs of
      // whitespace where that token used to be - collapse them so the
      // result reads as one clean name instead of "RJ01111   Title".
      .replace(/\s+/g, ' ')
      .trim()

    if (!usesExtToken && target.kind === 'file' && ext) newName += ext

    return { oldName: target.name, newName }
  })
}
