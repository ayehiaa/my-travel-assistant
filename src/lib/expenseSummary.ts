import { ExpenseWithCategory } from '@/types/database'

export interface CurrencySummary {
  total: number
  reclaimed: number
  pending: number
}

export function computeExpenseSummary(
  expenses: ExpenseWithCategory[]
): Record<string, CurrencySummary> {
  return expenses.reduce((acc, e) => {
    const cur = e.currency
    if (!acc[cur]) acc[cur] = { total: 0, reclaimed: 0, pending: 0 }
    acc[cur].total += e.amount
    if (e.reclaimed) {
      acc[cur].reclaimed += e.amount
    } else {
      acc[cur].pending += e.amount
    }
    return acc
  }, {} as Record<string, CurrencySummary>)
}
