import { describe, it, expect } from 'vitest'
import { computeExpenseSummary } from './expenseSummary'
import { ExpenseWithCategory } from '@/types/database'

function makeExpense(overrides: Partial<ExpenseWithCategory> = {}): ExpenseWithCategory {
  return {
    id: 'exp-1',
    owner_id: 'user-1',
    trip_id: null,
    category_id: 'cat-1',
    title: 'Expense',
    amount: 100,
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
    category: { name: 'General' },
    ...overrides,
  }
}

describe('computeExpenseSummary', () => {
  it('returns an empty object for an empty array', () => {
    expect(computeExpenseSummary([])).toEqual({})
  })

  it('single GBP expense, not reclaimed, amount 100 → pending=100, reclaimed=0', () => {
    const result = computeExpenseSummary([makeExpense({ amount: 100, currency: 'GBP', reclaimed: false })])
    expect(result).toEqual({
      GBP: { total: 100, reclaimed: 0, pending: 100 },
    })
  })

  it('single GBP expense, reclaimed, amount 50 → reclaimed=50, pending=0', () => {
    const result = computeExpenseSummary([makeExpense({ amount: 50, currency: 'GBP', reclaimed: true })])
    expect(result).toEqual({
      GBP: { total: 50, reclaimed: 50, pending: 0 },
    })
  })

  it('two GBP and one USD expense → two keys with correct totals', () => {
    const expenses = [
      makeExpense({ id: 'e1', amount: 80, currency: 'GBP', reclaimed: false }),
      makeExpense({ id: 'e2', amount: 120, currency: 'GBP', reclaimed: true }),
      makeExpense({ id: 'e3', amount: 200, currency: 'USD', reclaimed: false }),
    ]
    const result = computeExpenseSummary(expenses)
    expect(result).toEqual({
      GBP: { total: 200, reclaimed: 120, pending: 80 },
      USD: { total: 200, reclaimed: 0, pending: 200 },
    })
  })

  it('mix of reclaimed and pending in same currency → totals sum correctly', () => {
    const expenses = [
      makeExpense({ id: 'e1', amount: 30, currency: 'EUR', reclaimed: true }),
      makeExpense({ id: 'e2', amount: 70, currency: 'EUR', reclaimed: false }),
      makeExpense({ id: 'e3', amount: 50, currency: 'EUR', reclaimed: true }),
      makeExpense({ id: 'e4', amount: 10, currency: 'EUR', reclaimed: false }),
    ]
    const result = computeExpenseSummary(expenses)
    expect(result).toEqual({
      EUR: { total: 160, reclaimed: 80, pending: 80 },
    })
  })
})
