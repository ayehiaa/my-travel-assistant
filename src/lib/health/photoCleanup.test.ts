import { describe, it, expect } from 'vitest'
import { photoDecision, retentionCutoff, withoutPaths } from './photoCleanup'

const now = new Date('2026-11-22T03:00:00Z')
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()

describe('photo retention', () => {
  it('expired after 30 days, orphan after 24 h, progress photos kept', () => {
    const ref = new Set(['u/2026-11-21/a.jpg'])
    expect(photoDecision({ path: 'u/2026-10-01/x.jpg', createdAt: ago(31 * 24) }, new Set(['u/2026-10-01/x.jpg']), now)).toBe('expired')
    expect(photoDecision({ path: 'u/2026-11-20/b.jpg', createdAt: ago(25) }, ref, now)).toBe('orphan')
    expect(photoDecision({ path: 'u/2026-11-21/c.jpg', createdAt: ago(2) }, ref, now)).toBe('keep')
    expect(photoDecision({ path: 'u/2026-11-21/a.jpg', createdAt: ago(48) }, ref, now)).toBe('keep')
    expect(photoDecision({ path: 'progress/u/p.jpg', createdAt: ago(1000) }, ref, now)).toBe('keep')
    expect(photoDecision({ path: 'u/x.jpg', createdAt: null }, ref, now)).toBe('keep')
  })
  it('helpers', () => {
    expect(retentionCutoff(now)).toBe('2026-10-23T03:00:00.000Z')
    expect(withoutPaths(['a', 'b'], new Set(['a']))).toEqual(['b'])
  })
})
