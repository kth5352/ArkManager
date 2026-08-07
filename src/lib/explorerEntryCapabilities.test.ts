import { describe, expect, it } from 'vitest'
import { getExplorerEntryCapabilities } from './explorerEntryCapabilities'

function entry(name: string, kind: 'file' | 'folder') {
  return { name, kind }
}

describe('getExplorerEntryCapabilities', () => {
  it('allows game data actions for folders and archive files', () => {
    expect(getExplorerEntryCapabilities(entry('RJ01111111', 'folder')).canManageGameData).toBe(true)
    expect(getExplorerEntryCapabilities(entry('RJ01111111.zip', 'file')).canManageGameData).toBe(
      true
    )
    expect(getExplorerEntryCapabilities(entry('RJ01111111.egg', 'file')).canManageGameData).toBe(
      true
    )
  })

  it('hides game data actions for non-archive regular files', () => {
    expect(getExplorerEntryCapabilities(entry('RJ01111111.txt', 'file')).canManageGameData).toBe(
      false
    )
  })

  it('only exposes direct launch for executable files and media playback for media files', () => {
    expect(getExplorerEntryCapabilities(entry('game.exe', 'file'))).toMatchObject({
      canDirectLaunchFile: true,
      canPlayMedia: false,
    })
    expect(getExplorerEntryCapabilities(entry('op.mp4', 'file'))).toMatchObject({
      canDirectLaunchFile: false,
      canPlayMedia: true,
    })
    expect(getExplorerEntryCapabilities(entry('readme.txt', 'file'))).toMatchObject({
      canDirectLaunchFile: false,
      canPlayMedia: false,
    })
  })
})
