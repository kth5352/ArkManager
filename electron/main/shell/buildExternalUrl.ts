import type { GameCode } from '../../../shared/types/scanner'

// VJ is assumed to share RJ's DLsite URL pattern (product_id slot swapped for
// the VJ code) - this has not been independently confirmed against a real VJ
// listing. If it turns out to be wrong, only this function needs to change.
export function buildExternalUrl(code: GameCode): string {
  if (code.type === 'ST') {
    const numericId = code.value.slice(2)
    return `https://store.steampowered.com/app/${numericId}`
  }
  return `http://dlsite.com/maniax/work/=/product_id/${code.value}.html`
}
