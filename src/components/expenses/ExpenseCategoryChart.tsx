'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { buildExpenseCategoryChartData } from '@/lib/expenseChartData'
import { ExpenseWithCategory, ExpenseCategory } from '@/types/database'

interface Props {
  expenses: ExpenseWithCategory[]
  categories: ExpenseCategory[]
}

export default function ExpenseCategoryChart({ expenses, categories }: Props) {
  const { rows, categoryColors, hasMultiCurrency } = buildExpenseCategoryChartData(expenses, categories)

  if (rows.length === 0) {
    return (
      <div className="border-2 border-dashed border-[var(--rule)] rounded-xl py-10 text-center mb-8">
        <p className="text-sm text-[var(--ink-3)] font-medium m-0">No expenses to display yet</p>
      </div>
    )
  }

  return (
    <div className="mb-8 overflow-x-auto">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(v: number) => v >= 1000 ? `£${(v / 1000).toFixed(1)}k` : `£${v}`}
            width={55}
          />
          <Tooltip
            formatter={(value, name) => [
              `£${Number(value).toFixed(2)}`,
              categories.find(c => c.id === name)?.name ?? name,
            ]}
          />
          <Legend formatter={(name: string) => categories.find(c => c.id === name)?.name ?? name} />
          {categories
            .filter(cat => rows.some(row => (row[cat.id] as number) > 0))
            .map(cat => (
              <Bar key={cat.id} dataKey={cat.id} stackId="a" fill={categoryColors[cat.id]} />
            ))}
        </BarChart>
      </ResponsiveContainer>
      {hasMultiCurrency && (
        <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, marginBottom: 0 }}>
          Some expenses in other currencies are not shown in this chart.
        </p>
      )}
    </div>
  )
}
