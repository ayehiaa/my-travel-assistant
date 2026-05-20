# Data Model: Monthly Expense Category Chart

No new database entities are introduced. The chart derives all data client-side from existing tables.

## Existing entities used (read-only)

### ExpenseCategory (expense_categories)
| Field          | Type    | Notes                                |
|----------------|---------|--------------------------------------|
| id             | uuid    | Primary key                          |
| name           | string  | Display label in legend              |
| display_order  | integer | Determines color assignment index    |

### Expense (expenses)
| Field        | Type   | Notes                                     |
|--------------|--------|-------------------------------------------|
| id           | uuid   | Primary key                               |
| amount       | number | Summed per (month, category) bucket       |
| currency     | string | Used to scope chart to single currency    |
| expense_date | string | ISO date — truncated to YYYY-MM for x-axis|
| category_id  | uuid   | FK → expense_categories.id               |

## Derived in-memory structure

### ChartRow (TypeScript interface — not persisted)
One row per calendar month, used as the Recharts `data` array entry.

```ts
interface ChartRow {
  month: string        // 'YYYY-MM' — used as Recharts dataKey
  label: string        // 'Jan 2026' — displayed on x-axis
  [categoryId: string]: number | string  // amount per category (0 if no expense)
}
```

### BuildExpenseCategoryChartDataResult (return type)
```ts
interface BuildExpenseCategoryChartDataResult {
  rows: ChartRow[]
  categoryColors: Record<string, string>  // categoryId → hex color
  hasMultiCurrency: boolean
}
```

## Color assignment
Colors are assigned by sorting categories by `display_order` and mapping index → palette slot. The palette is a fixed array of 12 hex strings defined in `src/lib/expenseChartData.ts`.
