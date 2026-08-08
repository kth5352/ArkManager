import type { UpdateInfo } from 'electron-updater'
import { load } from 'cheerio'
import type { ReleaseNote } from '../../shared/types/ipc'

const HTML_RELEASE_NOTE_PATTERN =
  /<\/?(?:p|ul|ol|li|br|h[1-6]|div|blockquote|pre|script|style|template|noscript|svg|iframe|object)\b/i

function releaseNoteToPlainText(note: string): string {
  if (!HTML_RELEASE_NOTE_PATTERN.test(note)) return note

  const $ = load(note, null, false)
  $('script, style, template, noscript, svg, iframe, object').remove()
  $('br').replaceWith('\n')
  $('li').each((_index, element) => {
    $(element).prepend('- ').append('\n')
  })
  $('p, h1, h2, h3, h4, h5, h6, div, blockquote, pre').each((_index, element) => {
    $(element).append('\n\n')
  })
  $('ul, ol').each((_index, element) => {
    $(element).append('\n')
  })

  return $.root()
    .text()
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// electron-updater reports releaseNotes as either a single string (GitHub
// release body for the target version alone) or an array of
// {version, note} covering every version between the currently-running one
// and the target - only in the array form once autoUpdater.fullChangelog is
// enabled (see updater.ts), otherwise GitHubProvider always collapses it to
// a plain string regardless of how many versions are being skipped.
// Normalized to always be an array so the renderer never has to handle both
// shapes.
//
// Pulled out of updater.ts (rather than living there directly) because
// that file sets electron-updater's autoUpdater options as a top-level
// module side effect, which lazily constructs a singleton requiring a real
// Electron `app` - importing it at all fails outside a running Electron
// process, including from a plain Vitest run. This file only imports
// electron-updater's TYPES (erased at compile time), so it stays testable
// like every other pure-logic file in this codebase.
export function normalizeReleaseNotes(info: UpdateInfo): ReleaseNote[] {
  const { releaseNotes } = info
  if (!releaseNotes) return []
  if (typeof releaseNotes === 'string') {
    return [{ version: info.version, note: releaseNoteToPlainText(releaseNotes) }]
  }
  return releaseNotes.map((entry) => ({
    version: entry.version,
    note: releaseNoteToPlainText(entry.note ?? ''),
  }))
}
