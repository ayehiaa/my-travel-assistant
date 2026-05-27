import { describe, it, expect } from 'vitest'
import { GEOPOLITICS_QUERY, fetchGeopoliticsArticles } from './newsapi'

describe('GEOPOLITICS_QUERY', () => {
  it('is a non-empty string', () => {
    expect(typeof GEOPOLITICS_QUERY).toBe('string')
    expect(GEOPOLITICS_QUERY.length).toBeGreaterThan(0)
  })

  it('contains expected geopolitical terms', () => {
    const lower = GEOPOLITICS_QUERY.toLowerCase()
    const hasAtLeastOne = ['sanctions', 'trade policy', 'elections', 'geopolitical'].some(t => lower.includes(t))
    expect(hasAtLeastOne).toBe(true)
  })
})

describe('fetchGeopoliticsArticles', () => {
  it('is exported as a function', () => {
    expect(typeof fetchGeopoliticsArticles).toBe('function')
  })

  it('returns empty array when NEWS_API_KEY is not set', async () => {
    const original = process.env.NEWS_API_KEY
    delete process.env.NEWS_API_KEY
    const result = await fetchGeopoliticsArticles()
    expect(result).toEqual([])
    process.env.NEWS_API_KEY = original
  })
})
