import { describe, it, expect } from 'vitest'
import { ISLAMIC_MANDATE, buildScreeningMandate, withIslamicMandate } from './islamicMandate'

describe('ISLAMIC_MANDATE', () => {
  it('names the forbidden instruments, activities and the 20% cap', () => {
    for (const phrase of ['ETFs', 'bonds', 'preferred shares', 'options', 'short selling', 'margin', 'alcohol', 'gambling', 'weapons', '20%']) {
      expect(ISLAMIC_MANDATE).toContain(phrase)
    }
  })

  it('is appended to a system prompt', () => {
    expect(withIslamicMandate('Base prompt.')).toBe('Base prompt.' + ISLAMIC_MANDATE)
  })
})

describe('buildScreeningMandate (specs/030)', () => {
  const full = { islamic: true, business: true, financial: true, stocks_only: true }
  const off = { islamic: false, business: false, financial: false, stocks_only: false }

  it('full config → exactly the spec-019 mandate; default of withIslamicMandate', () => {
    expect(buildScreeningMandate(full)).toBe(ISLAMIC_MANDATE)
    expect(withIslamicMandate('P', full)).toBe(withIslamicMandate('P'))
  })

  it('everything off → no mandate at all', () => {
    expect(buildScreeningMandate(off)).toBe('')
    expect(withIslamicMandate('Base.', off)).toBe('Base.')
  })

  it('stocks-only without Islamic → investment mandate, no Shariah wording', () => {
    const m = buildScreeningMandate({ ...off, stocks_only: true })
    expect(m).toContain('INDIVIDUAL COMMON STOCKS')
    expect(m).toContain('ETFs')
    expect(m).not.toMatch(/Shariah|ISLAMIC|alcohol|30%/)
  })

  it('business only → business activities, no ratio screen', () => {
    const m = buildScreeningMandate({ ...full, financial: false })
    expect(m).toContain('ISLAMIC MANDATE')
    expect(m).toContain('alcohol')
    expect(m).not.toContain('30%')
  })

  it('financial only → ratio screen, no business list', () => {
    const m = buildScreeningMandate({ ...full, business: false })
    expect(m).toContain('30%')
    expect(m).toContain('5% of revenue')
    expect(m).not.toContain('alcohol')
  })

  it('Islamic on without stocks-only → Shariah funds allowed wording, no blanket ETF ban', () => {
    const m = buildScreeningMandate({ ...full, stocks_only: false })
    expect(m).toContain('explicitly Shariah-compliant fund')
    expect(m).not.toContain('INDIVIDUAL COMMON STOCKS')
  })
})
