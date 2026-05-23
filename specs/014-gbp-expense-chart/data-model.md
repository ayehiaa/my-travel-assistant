# Data Model: GBP-Normalised Expense Chart

## No schema changes

This feature is display-only. No new tables, columns, or migrations are required.

## New TypeScript types

### `GbpRates`

```ts
// Serialisable rate map passed from server component to client components.
// rateMap[expenseDate][currencyCode] = multiplier to convert 1 unit of currency to GBP
// Example: rateMap["2024-01-15"]["USD"] = 0.7851  (1 USD → 0.7851 GBP)
type GbpRates = Record<string, Record<string, number>>
```

This type is serialisable as JSON — safe to cross the server→client prop boundary in Next.js App Router.

### Updated `BuildExpenseCategoryChartDataResult`

```ts
interface BuildExpenseCategoryChartDataResult {
  rows: ChartRow[]
  categoryColors: Record<string, string>
  hasConvertedCurrencies: boolean   // true → show "All amounts converted to GBP" label
  unconvertibleCount: number        // > 0 → show "N expenses could not be converted" note
}
```

`hasMultiCurrency: boolean` is **removed** — replaced by the two fields above.

## Data flow

```
frankfurter.app (external)
        ↓  fetch (server-side, cached)
currencyConverter.ts::buildGbpRates(expenses)
        ↓  GbpRates (plain object)
ExpensesPage (server component)
        ↓  prop: rateMap: GbpRates
ExpenseList (client component)
        ↓  prop: rateMap: GbpRates
ExpenseCategoryChart (client component)
        ↓  arg: rateMap: GbpRates
expenseChartData.ts::buildExpenseCategoryChartData(expenses, categories, rateMap)
        ↓  { rows, categoryColors, hasConvertedCurrencies, unconvertibleCount }
Recharts BarChart
```
