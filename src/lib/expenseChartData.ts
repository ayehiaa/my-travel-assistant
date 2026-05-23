import { ExpenseWithCategory, ExpenseCategory } from '@/types/database'
import { GbpRates, convertAmountToGbp } from './currencyConverter'

export const CATEGORY_COLORS: string[] = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#d97706',
]

export interface ChartRow {
  month: string   // 'YYYY-MM'
  label: string   // 'Jan 2026' — formatted for x-axis display
  [categoryId: string]: number | string
}

export interface BuildExpenseCategoryChartDataResult {
  rows: ChartRow[]
  categoryColors: Record<string, string>
  hasConvertedCurrencies: boolean
  unconvertibleCount: number
}

/**
 * Aggregates expenses into monthly buckets per category for a stacked bar chart.
 * When rateMap is provided, non-GBP expenses are converted to GBP using the rate map.
 * Expenses with no available rate for their date/currency are excluded and counted.
 * When rateMap is omitted, only GBP expenses are included.
 */
export function buildExpenseCategoryChartData(
  expenses: ExpenseWithCategory[],
  categories: ExpenseCategory[],
  rateMap?: GbpRates,
): BuildExpenseCategoryChartDataResult {
  // Sort categories by display_order ascending; build color map
  const sortedCategories = [...categories].sort((a, b) => a.display_order - b.display_order)
  const categoryColors: Record<string, string> = {}
  sortedCategories.forEach((cat, i) => {
    categoryColors[cat.id] = CATEGORY_COLORS[i % CATEGORY_COLORS.length]
  })

  let hasConvertedCurrencies = false
  let unconvertibleCount = 0

  // Build resolved list of { expense, gbpAmount } pairs
  type Resolved = { expense: ExpenseWithCategory; gbpAmount: number }
  const resolved: Resolved[] = []

  for (const e of expenses) {
    if (e.currency === 'GBP') {
      resolved.push({ expense: e, gbpAmount: e.amount })
    } else if (rateMap !== undefined) {
      const converted = convertAmountToGbp(e.amount, e.currency, e.expense_date, rateMap)
      if (converted !== null) {
        resolved.push({ expense: e, gbpAmount: converted })
        hasConvertedCurrencies = true
      } else {
        unconvertibleCount++
      }
    } else {
      // No rateMap provided — skip non-GBP expenses (legacy behaviour)
      unconvertibleCount++
    }
  }

  // Collect unique months, sort chronologically (ISO 'YYYY-MM' sorts lexicographically)
  const monthSet = new Set<string>()
  for (const { expense } of resolved) {
    monthSet.add(expense.expense_date.slice(0, 7))
  }
  const months = Array.from(monthSet).sort()

  // Build rows
  const rows: ChartRow[] = months.map(month => {
    const label = new Date(month + '-01').toLocaleDateString('en-GB', {
      month: 'short',
      year: 'numeric',
    })

    const row: ChartRow = { month, label }

    for (const cat of sortedCategories) {
      const total = resolved
        .filter(({ expense }) => expense.expense_date.slice(0, 7) === month && expense.category_id === cat.id)
        .reduce((sum, { gbpAmount }) => sum + gbpAmount, 0)
      row[cat.id] = total
    }

    return row
  })

  return { rows, categoryColors, hasConvertedCurrencies, unconvertibleCount }
}
