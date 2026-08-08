export interface ZoomInput {
  type: string
  key: string
  code: string
  control: boolean
  meta: boolean
  alt: boolean
}

export interface ZoomableWebContents {
  on(
    event: 'before-input-event',
    listener: (event: { preventDefault: () => void }, input: ZoomInput) => void
  ): void
  isDestroyed(): boolean
  getZoomLevel(): number
  setZoomLevel(level: number): void
}

export function isZoomInShortcut(input: ZoomInput): boolean {
  const commandModifier = input.control || input.meta
  const plusKey = input.code === 'Equal' || input.code === 'NumpadAdd' || input.key === '+'
  return input.type === 'keyDown' && commandModifier && !input.alt && plusKey
}

export function installZoomInShortcut(webContents: ZoomableWebContents): void {
  webContents.on('before-input-event', (event, input) => {
    if (!isZoomInShortcut(input)) return

    event.preventDefault()
    if (webContents.isDestroyed()) return
    webContents.setZoomLevel(webContents.getZoomLevel() + 0.5)
  })
}
