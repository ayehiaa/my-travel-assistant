import { describe, it, expect } from 'vitest'
import { ISLAMIC_MANDATE, withIslamicMandate } from './islamicMandate'

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
