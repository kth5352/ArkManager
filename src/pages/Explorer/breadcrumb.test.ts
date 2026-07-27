import { describe, it, expect } from 'vitest'
import { pathToBreadcrumbSegments } from './breadcrumb'

describe('pathToBreadcrumbSegments', () => {
  it('splits a Windows-style path into segments', () => {
    expect(pathToBreadcrumbSegments('D:\\Games\\DLsite\\Voice')).toEqual([
      { label: 'D:', path: 'D:' },
      { label: 'Games', path: 'D:/Games' },
      { label: 'DLsite', path: 'D:/Games/DLsite' },
      { label: 'Voice', path: 'D:/Games/DLsite/Voice' },
    ])
  })

  it('ignores a trailing slash', () => {
    expect(pathToBreadcrumbSegments('D:\\Games\\')).toEqual([
      { label: 'D:', path: 'D:' },
      { label: 'Games', path: 'D:/Games' },
    ])
  })
})
