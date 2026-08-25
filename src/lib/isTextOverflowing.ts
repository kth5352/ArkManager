// Thin wrapper around the scrollWidth/clientWidth comparison so the
// DOM-measurement logic itself is a pure, testable function - MarqueeText
// calls this from a ref callback/effect (a real DOM read, not something a
// component test would exercise here per this project's convention of not
// testing component rendering).
export function isTextOverflowing(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth
}
