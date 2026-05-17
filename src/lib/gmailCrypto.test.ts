import { describe, it, expect, beforeAll } from 'vitest'
import { encryptToken, decryptToken } from './gmailCrypto'

beforeAll(() => {
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64')
})

describe('encryptToken / decryptToken', () => {
  it('round-trip: decrypting an encrypted value returns the original plaintext', () => {
    const plaintext = 'my-secret-oauth-refresh-token'
    const { ciphertext, iv } = encryptToken(plaintext)
    expect(decryptToken(ciphertext, iv)).toBe(plaintext)
  })

  it('round-trip works for an empty string', () => {
    const { ciphertext, iv } = encryptToken('')
    expect(decryptToken(ciphertext, iv)).toBe('')
  })

  it('round-trip works for a long token with special characters', () => {
    const plaintext = '1/ABcd-EFgh_IJ0123456789abcdef==.some-token/with+chars'
    const { ciphertext, iv } = encryptToken(plaintext)
    expect(decryptToken(ciphertext, iv)).toBe(plaintext)
  })

  it('two encryptions of the same plaintext produce different ciphertexts (random IV)', () => {
    const plaintext = 'same-input-text'
    const first = encryptToken(plaintext)
    const second = encryptToken(plaintext)
    expect(first.ciphertext).not.toBe(second.ciphertext)
    expect(first.iv).not.toBe(second.iv)
  })

  it('tampered ciphertext throws on decrypt (auth tag mismatch)', () => {
    const { ciphertext, iv } = encryptToken('some-token')
    // Flip the last hex character of the ciphertext
    const lastChar = ciphertext[ciphertext.length - 1]
    const flipped = lastChar === 'f' ? '0' : 'f'
    const tampered = ciphertext.slice(0, -1) + flipped
    expect(() => decryptToken(tampered, iv)).toThrow()
  })

  it('mismatched IV causes decrypt to throw', () => {
    const { ciphertext } = encryptToken('some-token')
    const wrongIv = Buffer.alloc(12, 0).toString('hex') // 12 zero bytes as hex
    expect(() => decryptToken(ciphertext, wrongIv)).toThrow()
  })

  it('missing GMAIL_TOKEN_ENCRYPTION_KEY throws on encrypt', () => {
    const saved = process.env.GMAIL_TOKEN_ENCRYPTION_KEY
    delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY
    try {
      expect(() => encryptToken('any')).toThrow('GMAIL_TOKEN_ENCRYPTION_KEY is not set')
    } finally {
      process.env.GMAIL_TOKEN_ENCRYPTION_KEY = saved
    }
  })
})
