export interface RenameTarget {
  name: string
  kind: 'file' | 'folder'
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

// Bulk-rename only - a single-target rename lets the user type the exact
// final name directly (see RenameDialog), since auto-appending the original
// extension here would double it up whenever that single typed name already
// includes one of its own.
//
// Tokens: {name} (original name, extension stripped for files), {ext}
// (original extension including the dot, empty for folders), {index}
// (1-based position), {index:N} (1-based, zero-padded to N digits). A file
// whose pattern omits {ext} keeps its original extension appended
// automatically, matching the common "batch rename" expectation that a
// short pattern like "Game {index}" doesn't strip every file's extension.
export function buildRenamePlan(targets: RenameTarget[], pattern: string): RenamePlanEntry[] {
  const usesExtToken = pattern.includes('{ext}')

  return targets.map((target, i) => {
    const { base, ext } = splitExtension(target.name, target.kind)
    const index = i + 1
    let newName = pattern
      .replace(/\{name\}/g, base)
      .replace(/\{index:(\d+)\}/g, (_match, digits: string) =>
        String(index).padStart(Number(digits), '0')
      )
      .replace(/\{index\}/g, String(index))
      .replace(/\{ext\}/g, ext)

    if (!usesExtToken && target.kind === 'file' && ext) newName += ext

    return { oldName: target.name, newName }
  })
}
