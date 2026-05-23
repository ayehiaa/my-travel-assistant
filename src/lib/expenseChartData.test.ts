import { describe, it, expect } from 'vitest'
import {
  buildExpenseCategoryChartData,
  CATEGORY_COLORS,
} from './expenseChartData'
import { GbpRates } from './currencyConverter'
import { ExpenseWithCategory, ExpenseCategory } from '@/types/database'

function makeExpense(overrides: Partial<ExpenseWithCategory> = {}): ExpenseWithCategory {
  return {
    id: 'exp-1',
    owner_id: 'user-1',
    trip_id: null,
    category_id: 'cat-1',
    title: 'Expense',
    amount: 100,
    currency: 'GBP',
    expense_date: '2026-01-15',
    notes: null,
    receipt_url: null,
    receipt_name: null,
    reclaimed: false,
    reclaimed_at: null,
    reclaimed_by: null,
    reclaim_reference: null,
    created_by: 'user-1',
    last_modified_by: 'user-1',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    category: { name: 'General' },
    ...overrides,
  }
}

function makeCategory(overrides: Partial<ExpenseCategory> = {}): ExpenseCategory {
  return {
    id: 'cat-1',
    name: 'General',
    display_order: 1,
    ...overrides,
  }
}

describe('buildExpenseCategoryChartData', () => {
  it('returns empty rows and hasConvertedCurrencies=false for empty expenses', () => {
    const result = buildExpenseCategoryChartData([], [makeCategory()])
    expect(result.rows).toEqual([])
    expect(result.hasConvertedCurrencies).toBe(false)
    expect(result.unconvertibleCount).toBe(0)
  })

  it('returns empty rows when no categories are provided', () => {
    const result = buildExpenseCategoryChartData([], [])
    expect(result.rows).toEqual([])
    expect(result.hasConvertedCurrencies).toBe(false)
    expect(result.unconvertibleCount).toBe(0)
  })

  it('single month, single category → one row with correct amount', () => {
    const cat = makeCategory({ id: 'cat-1', display_order: 1 })
    const expense = makeExpense({ category_id: 'cat-1', amount: 250, expense_date: '2026-01-10' })

    const { rows } = buildExpenseCategoryChartData([expense], [cat])

    expect(rows).toHaveLength(1)
    expect(rows[0].month).toBe('2026-01')
    expect(rows[0]['cat-1']).toBe(250)
  })

  it('single month sums multiple expenses in the same category', () => {
    const cat = makeCategory({ id: 'cat-1', display_order: 1 })
    const expenses = [
      makeExpense({ id: 'e1', category_id: 'cat-1', amount: 100, expense_date: '2026-01-05' }),
      makeExpense({ id: 'e2', category_id: 'cat-1', amount: 75, expense_date: '2026-01-20' }),
    ]

    const { rows } = buildExpenseCategoryChartData(expenses, [cat])

    expect(rows).toHaveLength(1)
    expect(rows[0]['cat-1']).toBe(175)
  })

  it('multiple months are sorted chronologically', () => {
    const cat = makeCategory({ id: 'cat-1', display_order: 1 })
    const expenses = [
      makeExpense({ id: 'e1', category_id: 'cat-1', amount: 50, expense_date: '2026-03-01' }),
      makeExpense({ id: 'e2', category_id: 'cat-1', amount: 30, expense_date: '2026-01-15' }),
      makeExpense({ id: 'e3', category_id: 'cat-1', amount: 80, expense_date: '2026-02-10' }),
    ]

    const { rows } = buildExpenseCategoryChartData(expenses, [cat])

    expect(rows).toHaveLength(3)
    expect(rows[0].month).toBe('2026-01')
    expect(rows[1].month).toBe('2026-02')
    expect(rows[2].month).toBe('2026-03')
  })

  it('multiple months, multiple categories → each row has a key per category with correct amounts', () => {
    const cat1 = makeCategory({ id: 'cat-1', name: 'Travel', display_order: 1 })
    const cat2 = makeCategory({ id: 'cat-2', name: 'Hotels', display_order: 2 })
    const expenses = [
      makeExpense({ id: 'e1', category_id: 'cat-1', amount: 200, expense_date: '2026-01-10' }),
      makeExpense({ id: 'e2', category_id: 'cat-2', amount: 150, expense_date: '2026-01-20' }),
      makeExpense({ id: 'e3', category_id: 'cat-1', amount: 300, expense_date: '2026-02-05' }),
    ]

    const { rows } = buildExpenseCategoryChartData(expenses, [cat1, cat2])

    expect(rows).toHaveLength(2)

    // January row
    expect(rows[0].month).toBe('2026-01')
    expect(rows[0]['cat-1']).toBe(200)
    expect(rows[0]['cat-2']).toBe(150)

    // February row
    expect(rows[1].month).toBe('2026-02')
    expect(rows[1]['cat-1']).toBe(300)
    expect(rows[1]['cat-2']).toBe(0)  // cat-2 has no expenses in Feb
  })

  it('category with no expenses in a given month defaults to 0', () => {
    const cat1 = makeCategory({ id: 'cat-1', display_order: 1 })
    const cat2 = makeCategory({ id: 'cat-2', display_order: 2 })
    const expense = makeExpense({ category_id: 'cat-1', amount: 100, expense_date: '2026-01-01' })

    const { rows } = buildExpenseCategoryChartData([expense], [cat1, cat2])

    expect(rows[0]['cat-2']).toBe(0)
  })

  it('non-GBP expenses without rateMap → excluded, unconvertibleCount incremented', () => {
    const cat = makeCategory({ id: 'cat-1', display_order: 1 })
    const expenses = [
      makeExpense({ id: 'e1', category_id: 'cat-1', amount: 100, currency: 'GBP', expense_date: '2026-01-10' }),
      makeExpense({ id: 'e2', category_id: 'cat-1', amount: 999, currency: 'USD', expense_date: '2026-01-10' }),
    ]

    const { rows, hasConvertedCurrencies, unconvertibleCount } = buildExpenseCategoryChartData(expenses, [cat])

    expect(hasConvertedCurrencies).toBe(false)
    expect(unconvertibleCount).toBe(1)
    expect(rows).toHaveLength(1)
    // Only the GBP amount should appear
    expect(rows[0]['cat-1']).toBe(100)
  })

  it('all-USD expenses without rateMap → empty rows, unconvertibleCount matches expense count', () => {
    const cat = makeCategory({ id: 'cat-1', display_order: 1 })
    const expenses = [
      makeExpense({ id: 'e1', category_id: 'cat-1', amount: 500, currency: 'USD', expense_date: '2026-01-10' }),
    ]

    const { rows, hasConvertedCurrencies, unconvertibleCount } = buildExpenseCategoryChartData(expenses, [cat])

    expect(hasConvertedCurrencies).toBe(false)
    expect(unconvertibleCount).toBe(1)
    expect(rows).toEqual([])
  })

  it('all GBP expenses with empty rateMap → hasConvertedCurrencies=false, unconvertibleCount=0', () => {
    const cat = makeCategory({ id: 'cat-1', display_order: 1 })
    const expenses = [
      makeExpense({ id: 'e1', category_id: 'cat-1', amount: 100, currency: 'GBP', expense_date: '2026-01-10' }),
      makeExpense({ id: 'e2', category_id: 'cat-1', amount: 200, currency: 'GBP', expense_date: '2026-02-05' }),
    ]
    const rateMap: GbpRates = {}

    const { rows, hasConvertedCurrencies, unconvertibleCount } = buildExpenseCategoryChartData(expenses, [cat], rateMap)

    expect(hasConvertedCurrencies).toBe(false)
    expect(unconvertibleCount).toBe(0)
    expect(rows).toHaveLength(2)
    expect(rows[0]['cat-1']).toBe(100)
    expect(rows[1]['cat-1']).toBe(200)
  })

  it('mixed currencies with rates → correct converted totals, hasConvertedCurrencies=true, unconvertibleCount=0', () => {
    const cat = makeCategory({ id: 'cat-1', display_order: 1 })
    const expenses = [
      makeExpense({ id: 'e1', category_id: 'cat-1', amount: 100, currency: 'GBP', expense_date: '2026-01-10' }),
      makeExpense({ id: 'e2', category_id: 'cat-1', amount: 200, currency: 'USD', expense_date: '2026-01-10' }),
    ]
    // 1 USD = 0.79 GBP, so 200 USD → 158 GBP
    const rateMap: GbpRates = { '2026-01-10': { USD: 0.79 } }

    const { rows, hasConvertedCurrencies, unconvertibleCount } = buildExpenseCategoryChartData(expenses, [cat], rateMap)

    expect(hasConvertedCurrencies).toBe(true)
    expect(unconvertibleCount).toBe(0)
    expect(rows).toHaveLength(1)
    expect(rows[0]['cat-1']).toBeCloseTo(100 + 200 * 0.79, 5)
  })

  it('mixed currencies with one missing rate → unconvertibleCount=1, hasConvertedCurrencies=false', () => {
    const cat = makeCategory({ id: 'cat-1', display_order: 1 })
    const expenses = [
      makeExpense({ id: 'e1', category_id: 'cat-1', amount: 100, currency: 'GBP', expense_date: '2026-01-10' }),
      makeExpense({ id: 'e2', category_id: 'cat-1', amount: 200, currency: 'EUR', expense_date: '2026-01-10' }),
    ]
    // rateMap has no entry for EUR on this date
    const rateMap: GbpRates = { '2026-01-10': { USD: 0.79 } }

    const { rows, hasConvertedCurrencies, unconvertibleCount } = buildExpenseCategoryChartData(expenses, [cat], rateMap)

    expect(unconvertibleCount).toBe(1)
    expect(hasConvertedCurrencies).toBe(false)
    expect(rows).toHaveLength(1)
    // Only GBP expense included
    expect(rows[0]['cat-1']).toBe(100)
  })

  it('all non-GBP with all rates available → all converted, rows non-empty, hasConvertedCurrencies=true', () => {
    const cat = makeCategory({ id: 'cat-1', display_order: 1 })
    const expenses = [
      makeExpense({ id: 'e1', category_id: 'cat-1', amount: 100, currency: 'USD', expense_date: '2026-01-10' }),
      makeExpense({ id: 'e2', category_id: 'cat-1', amount: 200, currency: 'EUR', expense_date: '2026-01-10' }),
    ]
    const rateMap: GbpRates = { '2026-01-10': { USD: 0.79, EUR: 0.86 } }

    const { rows, hasConvertedCurrencies, unconvertibleCount } = buildExpenseCategoryChartData(expenses, [cat], rateMap)

    expect(hasConvertedCurrencies).toBe(true)
    expect(unconvertibleCount).toBe(0)
    expect(rows).toHaveLength(1)
    expect(rows[0]['cat-1']).toBeCloseTo(100 * 0.79 + 200 * 0.86, 5)
  })

  it('empty expenses array → rows=[], hasConvertedCurrencies=false, unconvertibleCount=0', () => {
    const rateMap: GbpRates = { '2026-01-10': { USD: 0.79 } }
    const { rows, hasConvertedCurrencies, unconvertibleCount } = buildExpenseCategoryChartData([], [makeCategory()], rateMap)

    expect(rows).toEqual([])
    expect(hasConvertedCurrencies).toBe(false)
    expect(unconvertibleCount).toBe(0)
  })

  it('color assignment → first category by display_order gets CATEGORY_COLORS[0], second gets CATEGORY_COLORS[1]', () => {
    // Intentionally pass categories out of display_order order to verify sorting
    const cat2 = makeCategory({ id: 'cat-2', name: 'Hotels', display_order: 2 })
    const cat1 = makeCategory({ id: 'cat-1', name: 'Travel', display_order: 1 })

    const { categoryColors } = buildExpenseCategoryChartData([], [cat2, cat1])

    expect(categoryColors['cat-1']).toBe(CATEGORY_COLORS[0])
    expect(categoryColors['cat-2']).toBe(CATEGORY_COLORS[1])
  })

  it('categoryColors contains an entry for every category regardless of whether it has expenses', () => {
    const cat1 = makeCategory({ id: 'cat-1', display_order: 1 })
    const cat2 = makeCategory({ id: 'cat-2', display_order: 2 })

    const { categoryColors } = buildExpenseCategoryChartData([], [cat1, cat2])

    expect(Object.keys(categoryColors)).toHaveLength(2)
    expect(categoryColors['cat-1']).toBeDefined()
    expect(categoryColors['cat-2']).toBeDefined()
  })

  it('row label is formatted correctly as short month + year', () => {
    const cat = makeCategory({ id: 'cat-1', display_order: 1 })
    const expense = makeExpense({ category_id: 'cat-1', expense_date: '2026-01-15' })

    const { rows } = buildExpenseCategoryChartData([expense], [cat])

    // en-GB locale with { month: 'short', year: 'numeric' } — value depends on environment
    // Verify it contains '2026' and a 3-letter month abbreviation
    expect(rows[0].label).toMatch(/Jan/)
    expect(rows[0].label).toMatch(/2026/)
  })

  it('color wraps around when more than 12 categories exist', () => {
    const categories = Array.from({ length: 13 }, (_, i) =>
      makeCategory({ id: `cat-${i}`, display_order: i }),
    )

    const { categoryColors } = buildExpenseCategoryChartData([], categories)

    // The 13th category (index 12) wraps to CATEGORY_COLORS[0]
    expect(categoryColors['cat-12']).toBe(CATEGORY_COLORS[0])
  })
})
