import { describe, it, expect } from 'vitest'
import { synthesizerWording } from './synthesizer'

describe('synthesizerWording (specs/030)', () => {
  const full = { islamic: true, business: true, financial: true, stocks_only: true }

  it('full config keeps the Shariah-compliant common-stock wording', () => {
    const w = synthesizerWording(full)
    expect(w.newPortfolioRules).toContain('individual Shariah-compliant common stocks')
    expect(w.newHoldingsLine).toContain('otherwise non-compliant should be given 0%')
    expect(w.tickerRules).toContain('Never use ETFs')
  })

  it('Islamic off drops the Shariah wording but keeps stocks-only rules', () => {
    const w = synthesizerWording({ islamic: false, business: false, financial: false, stocks_only: true })
    expect(w.newPortfolioRules).not.toContain('Shariah')
    expect(w.newHoldingsLine).not.toContain('Shariah')
    expect(w.tickerRules).toContain('Never use ETFs')
  })

  it('stocks-only off allows ETFs', () => {
    const w = synthesizerWording({ islamic: false, business: false, financial: false, stocks_only: false })
    expect(w.tickerRules).not.toContain('Never use ETFs')
    expect(w.newPortfolioRules).toContain('ETF is allowed')
  })
})
