import { describe, it, expect } from 'vitest'
import { isPremiumOrAbove } from './auth'

describe('isPremiumOrAbove', () => {
  it('returns true for premium', () => expect(isPremiumOrAbove('premium')).toBe(true))
  it('returns true for premium_plus', () => expect(isPremiumOrAbove('premium_plus')).toBe(true))
  it('returns false for main', () => expect(isPremiumOrAbove('main')).toBe(false))
  it('returns false for assistant', () => expect(isPremiumOrAbove('assistant')).toBe(false))
})
