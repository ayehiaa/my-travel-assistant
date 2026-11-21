import { describe, it, expect, beforeAll } from 'vitest'
import { encryptCredential, decryptCredential } from './credentialCrypto'
import * as alpacaCrypto from './alpacaCrypto'

beforeAll(() => {
  process.env.ALPACA_CREDENTIAL_ENCRYPTION_KEY = Buffer.from('k'.repeat(32)).toString('base64')
})

describe('credentialCrypto', () => {
  it('round-trips an API key and never stores it in plain text', () => {
    const key = 'sk-ant-api03-example-key-abcd'
    const { ciphertext, iv } = encryptCredential(key)
    expect(ciphertext).not.toContain(key)
    expect(decryptCredential(ciphertext, iv)).toBe(key)
  })
  it('fails on a tampered ciphertext (GCM auth tag)', () => {
    const { ciphertext, iv } = encryptCredential('secret-value')
    const tampered = (ciphertext[0] === 'a' ? 'b' : 'a') + ciphertext.slice(1)
    expect(() => decryptCredential(tampered, iv)).toThrow()
  })
  it('alpacaCrypto re-exports the same helpers', () => {
    const { ciphertext, iv } = alpacaCrypto.encryptCredential('PKTEST')
    expect(decryptCredential(ciphertext, iv)).toBe('PKTEST')
  })
})
