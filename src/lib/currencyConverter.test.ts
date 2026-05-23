import { describe, it, expect } from 'vitest'
import { convertAmountToGbp, GbpRates } from './currencyConverter'

describe('convertAmountToGbp', () => {
  it('GBP passthrough — returns amount unchanged regardless of rate map', () => {
    expect(convertAmountToGbp(100, 'GBP', '2024-01-15', {})).toBe(100)
  })

  it('known rate conversion — multiplies by stored rate', () => {
    const rates: GbpRates = { '2024-01-15': { USD: 0.7851 } }
    expect(convertAmountToGbp(100, 'USD', '2024-01-15', rates)).toBeCloseTo(78.51, 5)
  })

  it('missing date in rate map — returns null', () => {
    const rates: GbpRates = { '2024-01-15': { USD: 0.7851 } }
    expect(convertAmountToGbp(100, 'USD', '2024-01-16', rates)).toBeNull()
  })

  it('missing currency for a present date — returns null', () => {
    const rates: GbpRates = { '2024-01-15': { USD: 0.7851 } }
    expect(convertAmountToGbp(100, 'EUR', '2024-01-15', rates)).toBeNull()
  })

  it('empty rate map with non-GBP currency — returns null', () => {
    expect(convertAmountToGbp(50, 'JPY', '2024-01-15', {})).toBeNull()
  })
})
