import { describe, it, expect } from 'vitest'
import { escapeCsvValue, buildCsvRow, buildCsvContent } from './csvFormatter'

describe('escapeCsvValue', () => {
  it('returns plain value unchanged', () => {
    expect(escapeCsvValue('London')).toBe('London')
  })

  it('wraps value with comma in double-quotes', () => {
    expect(escapeCsvValue('London, UK')).toBe('"London, UK"')
  })

  it('wraps value with double-quote and doubles embedded quote', () => {
    expect(escapeCsvValue('He said "hi"')).toBe('"He said ""hi"""')
  })

  it('wraps value with newline in double-quotes', () => {
    expect(escapeCsvValue('Line1\nLine2')).toBe('"Line1\nLine2"')
  })

  it('wraps value with carriage return in double-quotes', () => {
    expect(escapeCsvValue('Line1\rLine2')).toBe('"Line1\rLine2"')
  })

  it('returns empty string unchanged', () => {
    expect(escapeCsvValue('')).toBe('')
  })
})

describe('buildCsvRow', () => {
  it('joins values with commas and terminates with CRLF', () => {
    expect(buildCsvRow(['LHR', 'CDG'])).toBe('LHR,CDG\r\n')
  })
})

describe('buildCsvContent', () => {
  it('builds header + data row, both CRLF-terminated', () => {
    const header = ['From', 'To']
    const data = ['LHR', 'CDG']
    const result = buildCsvContent([header, data])
    expect(result).toBe('From,To\r\nLHR,CDG\r\n')
  })
})
