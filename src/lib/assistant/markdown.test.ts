import { describe, expect, it } from 'vitest'
import { inlineText, parseInline, parseMarkdown, sanitizeHref } from './markdown'

describe('sanitizeHref', () => {
  it('allows http(s), mailto and same-site paths only', () => {
    expect(sanitizeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(sanitizeHref('mailto:me@example.com')).toBe('mailto:me@example.com')
    expect(sanitizeHref('/expenses')).toBe('/expenses')
    expect(sanitizeHref('javascript:alert(1)')).toBeNull()
    expect(sanitizeHref('JAVASCRIPT:alert(1)')).toBeNull()
    expect(sanitizeHref('data:text/html,<b>x</b>')).toBeNull()
    expect(sanitizeHref('//evil.example')).toBeNull()
    expect(sanitizeHref('https://a b')).toBeNull()
  })
})

describe('parseInline', () => {
  it('parses bold, italic, code and links', () => {
    expect(parseInline('**£40** on *food* `x`')).toEqual([
      { t: 'strong', c: [{ t: 'text', v: '£40' }] },
      { t: 'text', v: ' on ' },
      { t: 'em', c: [{ t: 'text', v: 'food' }] },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'x' },
    ])
    expect(parseInline('[Expenses](/expenses)')).toEqual([{ t: 'link', href: '/expenses', c: [{ t: 'text', v: 'Expenses' }] }])
  })

  it('drops unsafe links to plain text and keeps raw HTML as text', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([{ t: 'text', v: 'click' }])
    expect(inlineText(parseInline('<img src=x onerror=alert(1)>'))).toBe('<img src=x onerror=alert(1)>')
  })

  it('does not treat snake_case or lone asterisks as emphasis', () => {
    expect(inlineText(parseInline('days_outside_uk and 2 * 3'))).toBe('days_outside_uk and 2 * 3')
  })
})

describe('parseMarkdown', () => {
  it('parses headings, lists, paragraphs and rules', () => {
    const blocks = parseMarkdown('## Summary\nYou were away **42 days**.\nSecond line\n\n- LHR → DXB\n- LHR → JFK\n\n1. one\n2. two\n\n---')
    expect(blocks.map(b => b.t)).toEqual(['h', 'p', 'ul', 'ol', 'hr'])
    const p = blocks[1]
    expect(p.t === 'p' && p.c.some(n => n.t === 'br')).toBe(true)
    const ul = blocks[2]
    expect(ul.t === 'ul' && ul.items.length).toBe(2)
  })

  it('parses tables with alignment and escaped pipes', () => {
    const blocks = parseMarkdown('| Category | Total |\n|:--|--:|\n| Hotel | £120 |\n| A\\|B | $5 |')
    expect(blocks).toHaveLength(1)
    const t = blocks[0]
    if (t.t !== 'table') throw new Error('expected table')
    expect(t.align).toEqual(['left', 'right'])
    expect(t.rows).toHaveLength(2)
    expect(inlineText(t.rows[1][0])).toBe('A|B')
  })

  it('keeps fenced code verbatim, also while still streaming', () => {
    expect(parseMarkdown('```json\n{"a": "<b>"}\n```')).toEqual([{ t: 'code', lang: 'json', v: '{"a": "<b>"}' }])
    expect(parseMarkdown('```\npartial')).toEqual([{ t: 'code', lang: null, v: 'partial' }])
  })

  it('parses block quotes', () => {
    const b = parseMarkdown('> note\n> more')
    expect(b[0].t).toBe('quote')
  })
})
