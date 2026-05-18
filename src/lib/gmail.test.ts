import { describe, it, expect } from 'vitest'
import { isTrustedSender } from './gmail'

describe('isTrustedSender', () => {
  it('returns true for a known airline with display name and angle brackets', () => {
    expect(isTrustedSender('British Airways <noreply@britishairways.com>')).toBe(true)
  })

  it('returns false for an unknown sender domain', () => {
    expect(isTrustedSender('random@gmail.com')).toBe(false)
  })

  it('returns false for a subdomain spoofing attack', () => {
    // The domain is britishairways.com.evil.com — should NOT match @britishairways.com
    expect(isTrustedSender('phishing@britishairways.com.evil.com')).toBe(false)
  })

  it('returns true for angle-bracket-only format with no display name', () => {
    expect(isTrustedSender('<noreply@ryanair.com>')).toBe(true)
  })

  it('returns true regardless of email casing (case insensitive)', () => {
    expect(isTrustedSender('NOREPLY@BRITISHAIRWAYS.COM')).toBe(true)
  })

  it('returns true for other known airline domains', () => {
    expect(isTrustedSender('no-reply@easyjet.com')).toBe(true)
    expect(isTrustedSender('confirm@lufthansa.com')).toBe(true)
    expect(isTrustedSender('bookings@emirates.com')).toBe(true)
  })

  it('returns true for known OTA / booking service domains', () => {
    expect(isTrustedSender('itinerary@expedia.com')).toBe(true)
    expect(isTrustedSender('confirm@booking.com')).toBe(true)
  })

  it('returns true for transactional subdomains of trusted airlines', () => {
    expect(isTrustedSender('confirm@email.britishairways.com')).toBe(true)
    expect(isTrustedSender('no-reply@info.ryanair.com')).toBe(true)
  })

  it('returns false for an empty string', () => {
    expect(isTrustedSender('')).toBe(false)
  })

  it('returns false when a trusted domain appears only in the display name, not the email', () => {
    // Display name contains britishairways.com but the actual email is evil.com
    expect(isTrustedSender('britishairways.com <attacker@evil.com>')).toBe(false)
  })
})
