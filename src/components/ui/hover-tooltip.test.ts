// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HoverTooltip } from './hover-tooltip'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(props: { content: string; delayMs?: number }): {
  getButton: () => HTMLButtonElement
} {
  act(() => {
    root.render(
      createElement(HoverTooltip, {
        content: props.content,
        delayMs: props.delayMs,
        children: createElement('button', {}, 'trigger'),
      })
    )
  })
  return {
    getButton: () => container.querySelector('button') as HTMLButtonElement,
  }
}

function tooltipText(): string | null {
  return document.querySelector('[role="tooltip"]')?.textContent ?? null
}

// Real (not faked) short timers - matches this project's established
// pattern (see electron/main/scanner/folderScanner.test.ts's D1 timeout
// test): mixing vi.useFakeTimers() with React's act() proved unreliable
// here (act() warned it wasn't "configured to support" the fake-timer-
// driven flush, and the assertion after it saw stale state) - a real, short
// delayMs sidesteps the interaction entirely.
async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    act(() => {})
  }
}

describe('HoverTooltip', () => {
  it('does not open immediately on mouseenter - waits for the delay', () => {
    const { getButton } = render({ content: 'Play', delayMs: 10_000 })
    act(() => {
      getButton().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    expect(tooltipText()).toBeNull()
  })

  it('opens after the hover delay elapses', async () => {
    const { getButton } = render({ content: 'Play', delayMs: 20 })
    act(() => {
      getButton().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    await flush()
    expect(tooltipText()).toBe('Play')
  })

  it('cancels the pending open if the mouse leaves before the delay elapses', async () => {
    const { getButton } = render({ content: 'Play', delayMs: 20 })
    act(() => {
      getButton().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    act(() => {
      getButton().dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    })
    await flush()
    expect(tooltipText()).toBeNull()
  })

  it('opens immediately on focus, with no delay', () => {
    const { getButton } = render({ content: 'Play', delayMs: 10_000 })
    act(() => {
      getButton().focus()
    })
    expect(tooltipText()).toBe('Play')
  })

  it('attaches aria-describedby to the real focused element, not the wrapper span', () => {
    const { getButton } = render({ content: 'Play' })
    act(() => {
      getButton().focus()
    })
    const tooltipEl = document.querySelector('[role="tooltip"]') as HTMLElement
    expect(getButton().getAttribute('aria-describedby')).toBe(tooltipEl.id)
  })

  it('removes aria-describedby again on blur', () => {
    const { getButton } = render({ content: 'Play' })
    act(() => {
      getButton().focus()
    })
    act(() => {
      getButton().blur()
    })
    expect(getButton().getAttribute('aria-describedby')).toBeNull()
    expect(tooltipText()).toBeNull()
  })

  it('merges with an existing aria-describedby instead of clobbering it', () => {
    const { getButton } = render({ content: 'Play' })
    getButton().setAttribute('aria-describedby', 'some-other-id')
    act(() => {
      getButton().focus()
    })
    const tooltipEl = document.querySelector('[role="tooltip"]') as HTMLElement
    expect(getButton().getAttribute('aria-describedby')).toBe(`some-other-id ${tooltipEl.id}`)

    act(() => {
      getButton().blur()
    })
    expect(getButton().getAttribute('aria-describedby')).toBe('some-other-id')
  })

  it('closes on Escape', () => {
    const { getButton } = render({ content: 'Play' })
    act(() => {
      getButton().focus()
    })
    expect(tooltipText()).toBe('Play')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(tooltipText()).toBeNull()
  })

  it('closes when the previously-shown content changes while open, not showing the stale label', () => {
    act(() => {
      root.render(
        createElement(HoverTooltip, {
          content: 'Track A',
          children: createElement('button', {}, 'trigger'),
        })
      )
    })
    act(() => {
      container.querySelector('button')!.focus()
    })
    expect(tooltipText()).toBe('Track A')

    // Simulates react-window recycling this exact component instance for a
    // different queue row - same DOM node, new label.
    act(() => {
      root.render(
        createElement(HoverTooltip, {
          content: 'Track B',
          children: createElement('button', {}, 'trigger'),
        })
      )
    })
    expect(tooltipText()).toBeNull()
  })
})
