import { numericGameCodeId } from '../../../shared/gameCode'
import type { GameCode } from '../../../shared/types/scanner'

// RJ and VJ are different DLsite work categories with different URL path
// segments (maniax vs pro) - confirmed against a real VJ listing.
export function buildExternalUrl(code: GameCode): string {
  if (code.type === 'ST') {
    const numericId = code.value.slice(2)
    return `https://store.steampowered.com/app/${numericId}`
  }
  if (code.type === 'VNV' || code.type === 'VNR') {
    const numericId = numericGameCodeId(code)
    const prefix = code.type === 'VNR' ? 'r' : 'v'
    return `https://vndb.org/${prefix}${numericId}`
  }
  if (code.type === 'GC') {
    const numericId = code.value.slice(2)
    return `https://www.getchu.com/soft.phtml?id=${numericId}`
  }
  const category = code.type === 'VJ' ? 'pro' : 'maniax'
  return `https://www.dlsite.com/${category}/work/=/product_id/${code.value}.html`
}
