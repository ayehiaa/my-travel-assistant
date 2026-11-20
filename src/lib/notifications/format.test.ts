import { describe, expect, it } from 'vitest'
import { escapeHtml, formatNyDate, formatNyUk, formatPct, formatSignedUsd, formatUsd, truncate } from './format'

describe('formatNyUk', () => {
  it('formats winter time (EST / GMT, 5 h apart)', () => {
    expect(formatNyUk('2026-11-20T15:30:00Z')).toBe('Fri 20 Nov 2026, 10:30 New York / 15:30 UK')
  })

  it('formats summer time (EDT / BST, 5 h apart)', () => {
    expect(formatNyUk('2026-07-01T14:30:00Z')).toBe('Wed 1 Jul 2026, 10:30 New York / 15:30 UK')
  })

  it('handles the March gap when the US is on DST and the UK is not (4 h apart)', () => {
    expect(formatNyUk('2026-03-10T14:30:00Z')).toBe('Tue 10 Mar 2026, 10:30 New York / 14:30 UK')
  })

  it('uses the New York date across midnight UK', () => {
    expect(formatNyUk('2026-11-21T02:00:00Z')).toBe('Fri 20 Nov 2026, 21:00 New York / 02:00 UK')
  })

  it('handles invalid input', () => {
    expect(formatNyUk('nope')).toBe('unknown time')
    expect(formatNyDate('nope')).toBe('unknown date')
  })
})

describe('number formatting', () => {
  it('formats USD', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50')
    expect(formatUsd(-50)).toBe('-$50.00')
    expect(formatUsd(null)).toBe('—')
    expect(formatSignedUsd(10)).toBe('+$10.00')
    expect(formatSignedUsd(-10)).toBe('-$10.00')
  })
  it('formats percentages', () => {
    expect(formatPct(1.234)).toBe('+1.23%')
    expect(formatPct(-0.5)).toBe('-0.50%')
    expect(formatPct(null)).toBe('—')
  })
})

describe('escapeHtml / truncate', () => {
  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })
  it('truncates with an ellipsis', () => {
    expect(truncate('hello', 10)).toBe('hello')
    expect(truncate('hello world', 6)).toBe('hello…')
  })
})
