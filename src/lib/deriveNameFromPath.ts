// Last path segment as a friendly display name, e.g. "D:\Games\Voice" ->
// "Voice". Falls back to the full path if it has no separators to split on.
export function deriveNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}
