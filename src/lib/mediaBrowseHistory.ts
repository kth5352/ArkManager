export interface BrowseHistoryState {
  entries: string[]
  index: number
}

export function resetBrowseHistory(rootPath: string): BrowseHistoryState {
  return { entries: [rootPath], index: 0 }
}

// 표준 브라우저 히스토리 동작 - 새 경로로 이동하면 현재 인덱스 이후의
// forward 기록은 버려진다. 현재 위치와 같은 경로로의 "이동"은 무시한다
// (브레드크럼에서 이미 있는 위치를 다시 클릭하는 경우 등).
export function navigateBrowseHistory(state: BrowseHistoryState, path: string): BrowseHistoryState {
  if (state.entries[state.index] === path) return state
  const entries = [...state.entries.slice(0, state.index + 1), path]
  return { entries, index: entries.length - 1 }
}

export function goBackInHistory(state: BrowseHistoryState): BrowseHistoryState {
  if (state.index === 0) return state
  return { ...state, index: state.index - 1 }
}

export function goForwardInHistory(state: BrowseHistoryState): BrowseHistoryState {
  if (state.index >= state.entries.length - 1) return state
  return { ...state, index: state.index + 1 }
}
