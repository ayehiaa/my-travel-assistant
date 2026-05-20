# Research: Monthly Expense Category Chart

## Decision 1 — Charting Library

**Decision**: Recharts v2

**Rationale**: No charting library is currently installed. Recharts is the most widely adopted React-native charting library: composable primitive API, first-class TypeScript types, tree-shakeable, MIT licensed, ~180 kB minified (acceptable). Its `BarChart` + `Bar` + `Tooltip` + `Legend` primitives map directly to the stacked-bar use case.

**Alternatives considered**:
- Chart.js / react-chartjs-2 — heavier, imperative Canvas API, awkward TypeScript.
- Victory — good API but larger bundle, less maintained.
- Tremor charts — bundles the entire Tremor UI; overkill for a single chart.
- Custom SVG — feasible but significant build time for tooltips, responsiveness, accessibility.

---

## Decision 2 — Data Source

**Decision**: Use `expenses` state (all loaded expenses, pre-filter) as input to the chart — not `filteredExpenses`.

**Rationale**: The chart's purpose is a monthly overview. Filtering by reclaim-status tab or date range would produce a misleadingly incomplete picture. The chart is always a full picture; the list below it can be filtered independently. A note about the active currency filter will be shown when multi-currency data is detected.

**Alternatives considered**:
- Use `filteredExpenses` — would make the chart reactive to tab/date filters, which could be confusing and is not what the user asked for.

---

## Decision 3 — Currency Handling

**Decision**: Default to GBP; render amounts only for the primary currency. When other currencies exist in the loaded dataset, show a small informational note ("X expenses in other currencies are not shown").

**Rationale**: Summing amounts across currencies produces meaningless totals. A note is the simplest correct approach for v1. Multi-currency charting is explicitly P3 per the spec.

---

## Decision 4 — Color Palette

**Decision**: Hardcode a palette of 12 distinct colors in the chart component; assign colors to categories by their `display_order` index (wrapping if there are more than 12 categories, which is practically impossible).

**Palette** (accessible, distinct):
```
#3b82f6  #10b981  #f59e0b  #ef4444  #8b5cf6
#ec4899  #06b6d4  #84cc16  #f97316  #6366f1
#14b8a6  #d97706
```

**Rationale**: Static assignment is deterministic — the same category always gets the same color across sessions without needing a DB column. 12 slots comfortably covers the real category count.

---

## Decision 5 — Aggregation Function Location

**Decision**: New pure function `buildExpenseCategoryChartData` in `src/lib/expenseChartData.ts`, with co-located tests `src/lib/expenseChartData.test.ts`.

**Rationale**: Constitution Principle V requires every pure business-logic function to have unit tests. Keeping it in `lib/` keeps the component thin and the logic independently testable.

---

## Decision 6 — Component Placement

**Decision**: Render `<ExpenseCategoryChart>` at the top of `ExpenseList`'s return, above the tabs/filters, below the page heading. No layout changes to the server page are needed.

**Rationale**: The server page (`src/app/expenses/page.tsx`) already passes `initialExpenses` and `categories` to `ExpenseList`. The chart can consume those props directly — no new data fetching.
