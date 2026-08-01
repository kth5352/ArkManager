import { join } from 'node:path'
import { backupSave } from './backupSave'

// Timestamp doubles as the snapshot's directory name under backupRootDir,
// so it must be filesystem-safe - ISO 8601 has : and . that Windows
// rejects in path segments, replaced with - here. Lexicographic sort of
// this format still matches chronological order, which listSnapshots
// relies on.
export function timestampToDirName(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

export async function createSnapshot(sourceDir: string, backupRootDir: string): Promise<string> {
  const timestamp = timestampToDirName(new Date())
  await backupSave(sourceDir, join(backupRootDir, timestamp))
  return timestamp
}
