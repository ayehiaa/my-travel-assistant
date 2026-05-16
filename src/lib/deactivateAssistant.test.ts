import { describe, it, expect } from 'vitest'
import { buildDeactivatedEmail } from './deactivateAssistant'

describe('buildDeactivatedEmail', () => {
  it('appends +deactivated_<timestamp> before @ for a standard address', () => {
    expect(buildDeactivatedEmail('alice@example.com', 1700000000)).toBe(
      'alice+deactivated_1700000000@example.com'
    )
  })

  it('appends +deactivated_<timestamp> after an existing plus segment', () => {
    expect(buildDeactivatedEmail('alice+work@example.com', 1700000000)).toBe(
      'alice+work+deactivated_1700000000@example.com'
    )
  })

  it('preserves a subdomain / multi-part domain', () => {
    expect(buildDeactivatedEmail('user@mail.example.co.uk', 1700000000)).toBe(
      'user+deactivated_1700000000@mail.example.co.uk'
    )
  })
})
