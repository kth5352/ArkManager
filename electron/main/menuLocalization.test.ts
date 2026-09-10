import { describe, expect, it } from 'vitest'
import { getMenuLabels } from './menuLocalization'

describe('getMenuLabels', () => {
  it('returns the Korean menu labels', () => {
    expect(getMenuLabels('ko')).toEqual({
      reload: '새로고침',
      forceReload: '강제 새로고침',
      manageExcludedItems: '제외 항목 관리...',
      reloadConfirmMessage: '미디어가 재생 중입니다. 새로고침하면 재생이 중단됩니다. 계속하시겠습니까?',
      reloadConfirmCancelButton: '취소',
      reloadConfirmConfirmButton: '새로고침',
    })
  })

  it('returns the Japanese menu labels', () => {
    expect(getMenuLabels('ja')).toEqual({
      reload: '再読み込み',
      forceReload: '強制再読み込み',
      manageExcludedItems: '除外項目の管理...',
      reloadConfirmMessage: 'メディアを再生中です。再読み込みすると再生が中断されます。続行しますか?',
      reloadConfirmCancelButton: 'キャンセル',
      reloadConfirmConfirmButton: '再読み込み',
    })
  })

  it('returns the English menu labels', () => {
    expect(getMenuLabels('en')).toEqual({
      reload: 'Reload',
      forceReload: 'Force Reload',
      manageExcludedItems: 'Manage Excluded Items...',
      reloadConfirmMessage: 'Media is currently playing. Reloading will stop playback. Continue?',
      reloadConfirmCancelButton: 'Cancel',
      reloadConfirmConfirmButton: 'Reload',
    })
  })

  it('falls back to Korean for an invalid or missing locale', () => {
    expect(getMenuLabels('fr')).toEqual(getMenuLabels('ko'))
    expect(getMenuLabels(undefined)).toEqual(getMenuLabels('ko'))
  })
})
