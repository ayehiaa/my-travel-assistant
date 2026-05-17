import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Generate key: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Set as GMAIL_TOKEN_ENCRYPTION_KEY env var (32-byte base64-encoded string)

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.GMAIL_TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY is not set')
  return Buffer.from(key, 'base64')
}

export function encryptToken(plaintext: string): { ciphertext: string; iv: string } {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Append auth tag to ciphertext, both hex-encoded
  const ciphertext = Buffer.concat([encrypted, tag]).toString('hex')
  return { ciphertext, iv: iv.toString('hex') }
}

export function decryptToken(ciphertext: string, iv: string): string {
  const data = Buffer.from(ciphertext, 'hex')
  const tag = data.subarray(data.length - TAG_LENGTH)
  const encrypted = data.subarray(0, data.length - TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'hex'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
