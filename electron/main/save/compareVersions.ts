// Used only to decide the restore-time "snapshot is newer than the
// installed game" warning (saveHandlers.ts's SAVE_CHECK_VERSION_MISMATCH)
// - null means "can't safely compare" (e.g. a manually-typed non-numeric
// version like "베타"), which the caller treats as "skip the warning",
// never as "less than".
export function compareVersions(a: string, b: string): number | null {
  const partsA = a.split('.')
  const partsB = b.split('.')
  const length = Math.max(partsA.length, partsB.length)

  for (let i = 0; i < length; i++) {
    const rawA = partsA[i] ?? '0'
    const rawB = partsB[i] ?? '0'
    if (!/^\d+$/.test(rawA) || !/^\d+$/.test(rawB)) return null

    const numA = Number(rawA)
    const numB = Number(rawB)
    if (numA !== numB) return numA > numB ? 1 : -1
  }

  return 0
}
