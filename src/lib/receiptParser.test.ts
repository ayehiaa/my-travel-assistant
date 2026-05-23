import { describe, it, expect } from 'vitest'
import { parseReceiptResponse } from './receiptParser'

describe('parseReceiptResponse', () => {
  it('valid full JSON → all four fields populated correctly', () => {
    const input = JSON.stringify({
      title: 'Costa Coffee',
      amount: 4.75,
      currency: 'GBP',
      date: '2026-05-23',
    })
    const result = parseReceiptResponse(input)
    expect(result).toEqual({
      title: 'Costa Coffee',
      amount: 4.75,
      currency: 'GBP',
      date: '2026-05-23',
    })
  })

  it('partial JSON with some nulls → partial result preserved', () => {
    const input = JSON.stringify({
      title: 'Pret a Manger',
      amount: null,
      currency: 'GBP',
      date: null,
    })
    const result = parseReceiptResponse(input)
    expect(result).toEqual({
      title: 'Pret a Manger',
      amount: null,
      currency: 'GBP',
      date: null,
    })
  })

  it('literal string "null" → all-null record', () => {
    const result = parseReceiptResponse('null')
    expect(result).toEqual({ title: null, amount: null, currency: null, date: null })
  })

  it('malformed JSON → all-null record', () => {
    const result = parseReceiptResponse('{not valid json}')
    expect(result).toEqual({ title: null, amount: null, currency: null, date: null })
  })

  it('amount as string "4.75" → coerced to number 4.75', () => {
    const input = JSON.stringify({ title: 'Shop', amount: '4.75', currency: 'GBP', date: '2026-01-01' })
    const result = parseReceiptResponse(input)
    expect(result.amount).toBe(4.75)
  })

  it('negative amount → null', () => {
    const input = JSON.stringify({ title: 'Shop', amount: -5, currency: 'GBP', date: '2026-01-01' })
    const result = parseReceiptResponse(input)
    expect(result.amount).toBeNull()
  })

  it('currency > 10 chars → null', () => {
    const input = JSON.stringify({ title: 'Shop', amount: 10, currency: 'TOOLONGCURRENCY', date: '2026-01-01' })
    const result = parseReceiptResponse(input)
    expect(result.currency).toBeNull()
  })

  it('date in wrong format ("21/05/2026") → null', () => {
    const input = JSON.stringify({ title: 'Shop', amount: 10, currency: 'GBP', date: '21/05/2026' })
    const result = parseReceiptResponse(input)
    expect(result.date).toBeNull()
  })

  it('markdown-fenced JSON → fences stripped, fields parsed correctly', () => {
    const input = '```json\n{"title":"Nero","amount":3.50,"currency":"GBP","date":"2026-03-15"}\n```'
    const result = parseReceiptResponse(input)
    expect(result).toEqual({
      title: 'Nero',
      amount: 3.5,
      currency: 'GBP',
      date: '2026-03-15',
    })
  })

  it('empty string → all-null record', () => {
    const result = parseReceiptResponse('')
    expect(result).toEqual({ title: null, amount: null, currency: null, date: null })
  })

  it('JSON with no recognised keys → all-null record', () => {
    const input = JSON.stringify({ foo: 'bar' })
    const result = parseReceiptResponse(input)
    expect(result).toEqual({ title: null, amount: null, currency: null, date: null })
  })
})
