import { describe, it, expect } from 'vitest'
import { generateShuffleOrderKeepingFront, generateShuffleOrderAvoidingFront } from './shuffleOrder'

function isPermutationOf(order: number[], length: number): boolean {
  if (order.length !== length) return false
  const seen = new Set(order)
  if (seen.size !== length) return false
  for (let i = 0; i < length; i++) {
    if (!seen.has(i)) return false
  }
  return true
}

describe('generateShuffleOrderKeepingFront', () => {
  it('returns a permutation of every index for the given length', () => {
    const order = generateShuffleOrderKeepingFront(5, 2)
    expect(isPermutationOf(order, 5)).toBe(true)
  })

  it('always places frontIndex first', () => {
    for (let i = 0; i < 20; i++) {
      const order = generateShuffleOrderKeepingFront(6, 3)
      expect(order[0]).toBe(3)
    }
  })

  it('handles a single-track playlist', () => {
    expect(generateShuffleOrderKeepingFront(1, 0)).toEqual([0])
  })
})

describe('generateShuffleOrderAvoidingFront', () => {
  it('returns a permutation of every index for the given length', () => {
    const order = generateShuffleOrderAvoidingFront(5, 2)
    expect(isPermutationOf(order, 5)).toBe(true)
  })

  it('never places avoidIndex first, across many runs', () => {
    for (let i = 0; i < 50; i++) {
      const order = generateShuffleOrderAvoidingFront(4, 1)
      expect(order[0]).not.toBe(1)
    }
  })

  it('handles a single-track playlist by returning that track (no other option exists)', () => {
    expect(generateShuffleOrderAvoidingFront(1, 0)).toEqual([0])
  })
})
