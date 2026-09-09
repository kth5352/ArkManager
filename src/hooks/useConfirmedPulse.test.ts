// @vitest-environment jsdom
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useConfirmedPulse } from './useConfirmedPulse'

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

async function flush(times = 25): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    act(() => {})
  }
}

function Harness({
  value,
  isLoaded,
  onSetToggle,
}: {
  value: boolean
  isLoaded: boolean
  onSetToggle: (fn: (v: boolean) => void) => void
}) {
  const [internal, setInternal] = useState(value)
  onSetToggle(setInternal)
  const pulsing = useConfirmedPulse(isLoaded ? internal : value, isLoaded)
  return createElement('div', { 'data-pulsing': pulsing ? 'true' : 'false' })
}

function isPulsing(): boolean {
  return container.querySelector('[data-pulsing]')?.getAttribute('data-pulsing') === 'true'
}

describe('useConfirmedPulse', () => {
  it('does not pulse when the value first becomes available (loading, not a real toggle)', () => {
    act(() => {
      root.render(createElement(Harness, { value: false, isLoaded: false, onSetToggle: () => {} }))
    })
    act(() => {
      root.render(createElement(Harness, { value: true, isLoaded: true, onSetToggle: () => {} }))
    })
    expect(isPulsing()).toBe(false)
  })

  it('pulses when the confirmed value changes after loading', async () => {
    let setInternal: (v: boolean) => void = () => {}
    act(() => {
      root.render(
        createElement(Harness, {
          value: false,
          isLoaded: true,
          onSetToggle: (fn) => {
            setInternal = fn
          },
        })
      )
    })
    expect(isPulsing()).toBe(false)

    act(() => {
      setInternal(true)
    })
    expect(isPulsing()).toBe(true)

    await flush()
    expect(isPulsing()).toBe(false)
  })
})
