import { describe, it, expect } from 'vitest'
import { imageFilesFrom, hasTextPayload } from './pastedImages'

const file = (name: string, type: string) => new File(['x'], name, { type })

describe('imageFilesFrom', () => {
  it('takes image items from a paste and ignores text / other files', () => {
    const png = file('image.png', 'image/png')
    const pdf = file('a.pdf', 'application/pdf')
    const dt = {
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => png },
        { kind: 'file', type: 'application/pdf', getAsFile: () => pdf },
      ],
    }
    expect(imageFilesFrom(dt)).toEqual([png])
  })

  it('falls back to .files (drag and drop) and de-duplicates', () => {
    const jpg = file('meal.jpg', 'image/jpeg')
    expect(imageFilesFrom({ items: [], files: [jpg, jpg] })).toEqual([jpg])
  })

  it('handles nothing to paste', () => {
    expect(imageFilesFrom(null)).toEqual([])
    expect(imageFilesFrom({})).toEqual([])
  })
})

describe('hasTextPayload', () => {
  it('detects plain text alongside the image', () => {
    expect(hasTextPayload({ types: ['Files', 'text/plain'] })).toBe(true)
    expect(hasTextPayload({ types: ['Files'] })).toBe(false)
    expect(hasTextPayload(null)).toBe(false)
  })
})
