# Quickstart: Monthly Expense Category Chart

## Install dependency

```bash
npm install recharts
```

## No DB migration required
All data is derived client-side from existing `expenses` and `expense_categories` data already loaded on the Expenses page.

## New files

| File | Purpose |
|------|---------|
| `src/lib/expenseChartData.ts` | Pure aggregation function |
| `src/lib/expenseChartData.test.ts` | Unit tests for aggregation |
| `src/components/expenses/ExpenseCategoryChart.tsx` | Chart UI component |

## Modified files

| File | Change |
|------|--------|
| `src/components/expenses/ExpenseList.tsx` | Import and render `<ExpenseCategoryChart>` above the tabs |

## Verify

```bash
npm test          # expenseChartData tests must pass
npm run build     # zero type errors
npm run lint      # zero warnings
```
