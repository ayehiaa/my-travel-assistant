import { describe, it, expect } from 'vitest'
import { scaleLineChart } from './chartPath'

const box = { width: 100, height: 50, pad: 0 }

describe('scaleLineChart', () => {
  it('maps min to the bottom and max to the top across the full width', () => {
    const c = scaleLineChart([10, 20, 30], box)
    expect(c.line).toBe('M0 50 L50 25 L100 0')
    expect(c.area).toBe('M0 50 L50 25 L100 0 L100 50 L0 50 Z')
    expect(c.min).toBe(10)
    expect(c.max).toBe(30)
    expect(c.last).toEqual({ x: 100, y: 0 })
  })

  it('applies padding', () => {
    const c = scaleLineChart([0, 1], { width: 120, height: 60, pad: 10 })
    expect(c.line).toBe('M10 50 L110 10')
  })

  it('skips null / non-finite points but keeps their x slot', () => {
    const c = scaleLineChart([10, null, NaN, 40, 30], box)
    expect(c.line).toBe('M0 50 L75 0 L100 16.67')
  })

  it('draws a flat series through the middle', () => {
    expect(scaleLineChart([5, 5, 5], box).line).toBe('M0 25 L50 25 L100 25')
  })

  it('widens the range to include the baseline and reports its y', () => {
    const c = scaleLineChart([110, 120], box, 100)
    expect(c.min).toBe(100)
    expect(c.baselineY).toBe(50)
    expect(c.line).toBe('M0 25 L100 0')
  })

  it('returns empty paths with fewer than 2 points', () => {
    expect(scaleLineChart([], box)).toMatchObject({ line: '', area: '', last: null })
    expect(scaleLineChart([null, 7], box)).toMatchObject({ line: '', min: 7, max: 7 })
  })
})
