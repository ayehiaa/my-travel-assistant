import { ExpenseWithCategory, ExpenseCategory } from '@/types/database'

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
  hasMultiCurrency: boolean
}

/**
 * Aggregates expenses into monthly buckets per category for a stacked bar chart.
 * Defaults to GBP — expenses in other currencies are excluded and flagged.
 *
 * v1 limitation: the Y-axis in the UI hardcodes '£'. Expenses in currencies
 * other than `currency` (default 'GBP') are excluded from the chart data.
 */
export function buildExpenseCategoryChartData(
  expenses: ExpenseWithCategory[],
  categories: ExpenseCategory[],
  currency = 'GBP',
): BuildExpenseCategoryChartDataResult {
  const hasMultiCurrency = expenses.some(e => e.currency !== currency)

  const filtered = expenses.filter(e => e.currency === currency)

  // Sort categories by display_order ascending; build color map
  const sortedCategories = [...categories].sort((a, b) => a.display_order - b.display_order)
  const categoryColors: Record<string, string> = {}
  sortedCategories.forEach((cat, i) => {
    categoryColors[cat.id] = CATEGORY_COLORS[i % CATEGORY_COLORS.length]
  })

  // Collect unique months, sort chronologically (ISO 'YYYY-MM' sorts lexicographically)
  const monthSet = new Set<string>()
  for (const e of filtered) {
    monthSet.add(e.expense_date.slice(0, 7))
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
      const total = filtered
        .filter(e => e.expense_date.slice(0, 7) === month && e.category_id === cat.id)
        .reduce((sum, e) => sum + e.amount, 0)
      row[cat.id] = total
    }

    return row
  })

  return { rows, categoryColors, hasMultiCurrency }
}
