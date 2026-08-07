import { describe, it, expect } from 'vitest'
import { pathToBreadcrumbSegments } from './breadcrumb'

describe('pathToBreadcrumbSegments', () => {
  it('splits a Windows-style path into segments, reconstructed with backslashes', () => {
    expect(pathToBreadcrumbSegments('D:\\Games\\DLsite\\Voice')).toEqual([
      { label: 'D:', path: 'D:\\' },
      { label: 'Games', path: 'D:\\Games' },
      { label: 'DLsite', path: 'D:\\Games\\DLsite' },
      { label: 'Voice', path: 'D:\\Games\\DLsite\\Voice' },
    ])
  })

  it('ignores a trailing slash', () => {
    expect(pathToBreadcrumbSegments('D:\\Games\\')).toEqual([
      { label: 'D:', path: 'D:\\' },
      { label: 'Games', path: 'D:\\Games' },
    ])
  })

  it('gives the drive-letter segment a trailing separator so it navigates to the drive root', () => {
    expect(pathToBreadcrumbSegments('D:\\Games')[0]).toEqual({ label: 'D:', path: 'D:\\' })
  })

  it('splits a path that already uses forward slashes', () => {
    expect(pathToBreadcrumbSegments('D:/Games/Sub')).toEqual([
      { label: 'D:', path: 'D:\\' },
      { label: 'Games', path: 'D:\\Games' },
      { label: 'Sub', path: 'D:\\Games\\Sub' },
    ])
  })

  it('builds UNC breadcrumb segments with server/share as the root', () => {
    expect(pathToBreadcrumbSegments('\\\\server\\share\\Games')).toEqual([
      { label: '\\\\server\\share', path: '\\\\server\\share\\' },
      { label: 'Games', path: '\\\\server\\share\\Games' },
    ])
  })
})
