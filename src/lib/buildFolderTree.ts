export interface FolderTreeNode {
  path: string
  name: string
  children: FolderTreeNode[]
}

// Windows paths mix backslash/forward-slash inconsistently, same concern
// ExplorerSidebar.tsx's own normalizePath and findLibraryForPath.ts already
// handle - lowercased + forward-slash so two paths that reach this module
// via different sources (a real ScannedEntry.path from a scan vs. a path
// reconstructed segment-by-segment below) compare equal for the same real
// folder.
function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

// Returns the path segments between `rootPath` and `path` (exclusive of
// root, inclusive of `path`'s own final segment) - e.g. root "D:\Media",
// path "D:\Media\A\B" -> ["A", "B"]. `path === rootPath` returns [] (root
// has no segments below itself). Returns null when `path` isn't actually
// under `rootPath` at all, so callers can skip/ignore it rather than
// building a bogus branch off the root.
//
// Deliberately NOT reusing breadcrumb.ts's pathToBreadcrumbSegments here -
// that helper walks a path from its drive/UNC root, which this module has
// no need for (every path this function ever sees is either `rootPath`
// itself or a descendant of it, always sharing rootPath's own separator
// convention since both come from the same recursive scan rooted at
// rootPath) - and pulling it in would also point src/lib at src/pages,
// which nothing else in src/lib does.
function relativeSegments(rootPath: string, path: string): string[] | null {
  const normalizedRoot = normalize(rootPath).toLowerCase()
  const normalizedPath = normalize(path)
  const normalizedPathLower = normalizedPath.toLowerCase()
  if (normalizedPathLower === normalizedRoot) return []
  if (!normalizedPathLower.startsWith(`${normalizedRoot}/`)) return null
  return normalizedPath.slice(normalizedRoot.length + 1).split('/').filter(Boolean)
}

// Builds the nested tree structure FolderTreeTab.tsx renders, from the flat
// list of folder paths a recursive scan returns. Intermediate folders are
// synthesized from path segments even when they never appear as their own
// entry in `folderPaths` (scanLibraryRecursive - what useFolderScanRecursive
// calls - collapses a "leaf-like" folder, i.e. one that directly holds a
// file, into a single entry and does not walk into its subfolders; a purely
// category-shaped ancestor above it is walked through but never itself
// emitted as an entry). Rebuilding ancestors from each entry's own path
// recovers that missing structure without needing scanLibraryRecursive to
// change.
export function buildFolderTree(rootPath: string, folderPaths: string[]): FolderTreeNode {
  const root: FolderTreeNode = { path: rootPath, name: rootPath, children: [] }
  const normalizedRootTrimmed = rootPath.replace(/[\\/]+$/, '')
  const nodesByKey = new Map<string, FolderTreeNode>([[normalize(rootPath).toLowerCase(), root]])

  for (const folderPath of folderPaths) {
    const segments = relativeSegments(rootPath, folderPath)
    if (!segments || segments.length === 0) continue

    let parent = root
    let builtPath = normalizedRootTrimmed
    for (const segment of segments) {
      builtPath = `${builtPath}\\${segment}`
      const key = normalize(builtPath).toLowerCase()
      let node = nodesByKey.get(key)
      if (!node) {
        node = { path: builtPath, name: segment, children: [] }
        nodesByKey.set(key, node)
        parent.children.push(node)
      }
      parent = node
    }
  }

  return root
}

// Path chain from `rootPath` down to `path` inclusive (both endpoints
// included), e.g. root "D:\Media", path "D:\Media\A\B" ->
// ["D:\Media", "D:\Media\A", "D:\Media\A\B"]. Used by FolderTreeTab.tsx to
// auto-expand every ancestor of the active browse path, mirroring
// ExplorerSidebar.tsx's own activePath auto-expand sync. Returns just
// [rootPath] when `path` isn't under `rootPath` (including when they're
// equal).
export function getFolderAncestorPaths(rootPath: string, path: string): string[] {
  const segments = relativeSegments(rootPath, path)
  if (!segments) return [rootPath]

  const paths = [rootPath]
  let builtPath = rootPath.replace(/[\\/]+$/, '')
  for (const segment of segments) {
    builtPath = `${builtPath}\\${segment}`
    paths.push(builtPath)
  }
  return paths
}
