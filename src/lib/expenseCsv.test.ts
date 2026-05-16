import { describe, it, expect } from 'vitest'
import { buildExpenseCsv } from './expenseCsv'
import { ExpenseWithCategory } from '@/types/database'

function makeExpense(overrides: Partial<ExpenseWithCategory> = {}): ExpenseWithCategory {
  return {
    id: 'exp-1',
    owner_id: 'user-1',
    trip_id: 'trip-1',
    category_id: 'cat-1',
    title: 'Hotel stay',
    amount: 150.0,
    currency: 'GBP',
    expense_date: '2025-06-01',
    notes: null,
    receipt_url: null,
    receipt_name: null,
    reclaimed: false,
    reclaimed_at: null,
    reclaimed_by: null,
    reclaim_reference: null,
    created_by: 'user-1',
    last_modified_by: 'user-1',
    created_at: '2025-06-01T10:00:00Z',
    updated_at: '2025-06-01T10:00:00Z',
    category: { name: 'Accommodation' },
    ...overrides,
  }
}

describe('buildExpenseCsv', () => {
  it('returns header row only for an empty array', () => {
    const result = buildExpenseCsv([])
    expect(result).toBe('Date,Title,Category,Amount,Currency,Reclaimed,Trip ID')
  })

  it('produces correct CSV line for a single expense with all fields populated', () => {
    const expense = makeExpense()
    const result = buildExpenseCsv([expense])
    const lines = result.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('Date,Title,Category,Amount,Currency,Reclaimed,Trip ID')
    expect(lines[1]).toBe('2025-06-01,Hotel stay,Accommodation,150,GBP,false,trip-1')
  })

  it('writes "true" in the Reclaimed column when reclaimed=true', () => {
    const expense = makeExpense({ reclaimed: true })
    const result = buildExpenseCsv([expense])
    const dataLine = result.split('\n')[1]
    const fields = dataLine.split(',')
    // Reclaimed is the 6th column (index 5)
    expect(fields[5]).toBe('true')
  })

  it('writes empty string in Trip ID column when trip_id is null', () => {
    const expense = makeExpense({ trip_id: null })
    const result = buildExpenseCsv([expense])
    const dataLine = result.split('\n')[1]
    // Last column (Trip ID) should be empty — line ends with a comma then nothing
    expect(dataLine.endsWith(',')).toBe(true)
    const fields = dataLine.split(',')
    expect(fields[fields.length - 1]).toBe('')
  })

  it('double-quotes a title that contains a comma', () => {
    const expense = makeExpense({ title: 'Flights, hotel' })
    const result = buildExpenseCsv([expense])
    const dataLine = result.split('\n')[1]
    expect(dataLine).toContain('"Flights, hotel"')
  })

  it('escapes a double-quote inside a title as "" within a quoted field', () => {
    const expense = makeExpense({ title: 'Say "hello"' })
    const result = buildExpenseCsv([expense])
    const dataLine = result.split('\n')[1]
    expect(dataLine).toContain('"Say ""hello"""')
  })
})
