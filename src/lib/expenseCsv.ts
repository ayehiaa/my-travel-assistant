import { ExpenseWithCategory } from '@/types/database'

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

export function buildExpenseCsv(expenses: ExpenseWithCategory[]): string {
  const header = ['Date', 'Title', 'Category', 'Amount', 'Currency', 'Reclaimed', 'Trip ID']
  const rows = expenses.map(e => [
    e.expense_date,
    escapeCsvField(e.title),
    escapeCsvField(e.category.name),
    String(e.amount),
    e.currency,
    String(e.reclaimed),
    e.trip_id ?? '',
  ])
  return [header, ...rows].map(row => row.join(',')).join('\n')
}
