# Architect Notes: GBP-Normalised Expense Chart

**Branch**: `014-gbp-expense-chart` | **Date**: 2026-05-23

---

## 1. Feature Summary

This feature replaces the existing "silently drop non-GBP expenses from the chart" behaviour with a server-side currency conversion step. When `ExpensesPage` (a Next.js server component) loads expense data from Supabase, it will also call `buildGbpRates(expenses)` to fetch historical GBP exchange rates from frankfurter.app (ECB-backed, no API key, free). The resulting `GbpRates` map is passed as a plain serialisable prop through `ExpenseList` (client component) to `ExpenseCategoryChart` (client component), which passes it into the pure `buildExpenseCategoryChartData` function. That function now converts non-GBP amounts to GBP using the rate map instead of excluding them. The chart disclaimer copy is updated to reflect three states: all converted, partial conversion, or GBP-only (no note). No schema changes are required; stored amounts and currencies are never modified.

---

## 2. Backend Tasks (T002–T009)

### T002 — Create `src/lib/currencyConverter.ts` (stub)

Create file with:

```ts
export type GbpRates = Record<string, Record<string, number>>

export async function buildGbpRates(
  expenses: import('@/types/database').ExpenseWithCategory[]
): Promise<GbpRates> {
  return {}
}
```

This stub must exist before any other file imports `GbpRates`, because T003, T009, T010, and T011 all depend on the type being importable.

### T003 — Update `BuildExpenseCategoryChartDataResult` in `src/lib/expenseChartData.ts`

Remove `hasMultiCurrency: boolean` from the interface. Add two replacement fields:

```ts
export interface BuildExpenseCategoryChartDataResult {
  rows: ChartRow[]
  categoryColors: Record<string, string>
  hasConvertedCurrencies: boolean   // at least one expense was converted from non-GBP
  unconvertibleCount: number        // count of non-GBP expenses with no rate available
}
```

**CRITICAL**: `ExpenseCategoryChart.tsx` line 13 currently destructures `hasMultiCurrency` from this result. That line will produce a TypeScript error the moment T003 is applied and before T011 updates the component. The backend agent must coordinate with the frontend agent so T011 is applied in the same commit, or T003 is applied as part of the same editing session as T011.

### T004 — Implement `buildGbpRates` in `src/lib/currencyConverter.ts`

Full function signature:

```ts
export async function buildGbpRates(
  expenses: ExpenseWithCategory[]
): Promise<GbpRates>
```

Implementation details:

1. Collect all unique `(date, currency)` pairs where `currency !== 'GBP'`.
2. Group by `expense_date` — for each unique date, collect the set of non-GBP currency codes on that date.
3. For each unique date, build the URL:
   ```
   https://api.frankfurter.app/{date}?from=GBP&to={currencies_comma_separated}
   ```
4. Determine `revalidate` value:
   ```ts
   const today = new Date().toISOString().slice(0, 10)
   const revalidate = date === today ? 3600 : 31536000
   ```
5. Call `fetch(url, { next: { revalidate } })`. On non-200 status:
   - If 404 (weekend/holiday): retry once with `https://api.frankfurter.app/latest?from=GBP&to={currencies}` using `{ next: { revalidate: 3600 } }`.
   - If 422 or any other error: skip this date silently (no `console.log`, no throw).
   - On network error/timeout (catch block): skip this date silently.
6. Parse the successful JSON response:
   ```ts
   interface FrankfurterResponse {
     amount: number
     base: string
     date: string
     rates: Record<string, number>
   }
   ```
   For each currency in `rates`: store `rateMap[date][currency] = 1 / rates[currency]` (the multiplier to convert 1 unit of that currency to GBP). `rates` from the API express "1 GBP = X currency", so the inverse gives "1 currency = Y GBP".
7. Run all date fetches in parallel: `await Promise.all([...])`.
8. Return the accumulated `GbpRates` map (dates with failed fetches are simply absent from the map).

No `console.log` anywhere in this function.

### T005 — Add `convertAmountToGbp` pure helper in `src/lib/currencyConverter.ts`

```ts
export function convertAmountToGbp(
  amount: number,
  currency: string,
  date: string,        // 'YYYY-MM-DD'
  rates: GbpRates
): number | null
```

Logic:
- If `currency === 'GBP'` return `amount` (passthrough, no lookup needed).
- If `rates[date]?.[currency]` is defined, return `amount * rates[date][currency]`.
- Otherwise return `null` (rate unavailable for this date/currency combination).

This function is pure — no I/O, no side effects, fully testable.

### T006 — Unit tests in `src/lib/currencyConverter.test.ts`

Test cases for `convertAmountToGbp` only (the `buildGbpRates` function makes network calls and is not pure, so it is not tested here):

| Case | Input | Expected |
|------|-------|----------|
| GBP passthrough | `(100, 'GBP', '2024-01-15', {})` | `100` |
| Known rate conversion | `(100, 'USD', '2024-01-15', { '2024-01-15': { USD: 0.7851 } })` | `78.51` |
| Missing date in map | `(100, 'USD', '2024-01-16', { '2024-01-15': { USD: 0.7851 } })` | `null` |
| Missing currency for date | `(100, 'EUR', '2024-01-15', { '2024-01-15': { USD: 0.7851 } })` | `null` |
| Empty rate map | `(50, 'JPY', '2024-01-15', {})` | `null` |

### T007 — Update `buildExpenseCategoryChartData` in `src/lib/expenseChartData.ts`

New signature:

```ts
export function buildExpenseCategoryChartData(
  expenses: ExpenseWithCategory[],
  categories: ExpenseCategory[],
  rateMap?: GbpRates,
): BuildExpenseCategoryChartDataResult
```

The third parameter changes from `currency = 'GBP'` (a string default) to `rateMap?: GbpRates` (an optional rate map). The old `currency` parameter is removed entirely.

Implementation changes:
- Remove the `currency` parameter and the `hasMultiCurrency` line.
- For each non-GBP expense, call `convertAmountToGbp(e.amount, e.currency, e.expense_date, rateMap ?? {})`.
  - If the result is a number: include it in the chart total (converted GBP value).
  - If the result is `null`: increment `unconvertibleCount` and skip this expense.
- GBP expenses always include their amount as-is (no conversion call needed).
- Set `hasConvertedCurrencies = true` if at least one non-GBP expense was successfully converted.
- The `monthSet` and row-building logic must now use all includable expenses (GBP + successfully converted), not a pre-filtered list.
- Return `{ rows, categoryColors, hasConvertedCurrencies, unconvertibleCount }`.

**Important implementation note**: the current code builds `filtered = expenses.filter(e => e.currency === currency)` and then iterates over `filtered` in two places (month collection and row building). Both of those loops must be replaced. The cleanest approach is to build a resolved list of `{ expense, gbpAmount }` pairs first, then use that list for both the month set and the row totals.

### T008 — Update `src/lib/expenseChartData.test.ts`

Add test cases (existing GBP-only tests must continue to pass — no regressions):

| Case | Description |
|------|-------------|
| All GBP, no rateMap | Result: `hasConvertedCurrencies = false`, `unconvertibleCount = 0`, all amounts unchanged |
| Mixed currencies, rates available | USD expense converted; `hasConvertedCurrencies = true`, `unconvertibleCount = 0` |
| Mixed currencies, rate missing | Non-GBP expense excluded; `unconvertibleCount = 1`, `hasConvertedCurrencies = false` |
| All non-GBP, all rates available | All converted; `rows` non-empty, `hasConvertedCurrencies = true` |
| Empty expenses array | `rows = []`, `hasConvertedCurrencies = false`, `unconvertibleCount = 0` |

### T009 — Update `src/app/expenses/page.tsx`

Add `buildGbpRates` import:

```ts
import { buildGbpRates, GbpRates } from '@/lib/currencyConverter'
```

Extend the existing `Promise.all` call (currently 4 items) to also await `buildGbpRates`:

```ts
const [
  { data: expenses },
  { data: categories },
  { data: rawTrips },
  { data: ownerRoleRow },
  rateMap,
] = await Promise.all([
  supabase.from('expenses').select(...),
  supabase.from('expense_categories').select(...),
  supabase.from('trips').select(...),
  supabase.from('user_roles').select(...).single(),
  buildGbpRates((expenses_placeholder ?? []) as ExpenseWithCategory[]),
])
```

**CRITICAL ordering problem**: `buildGbpRates` needs the resolved `expenses` array as input, but `expenses` is resolved inside the same `Promise.all`. The fix is a two-step approach:

```ts
// Step 1: fetch expenses (and other data) in parallel
const [{ data: expenses }, { data: categories }, { data: rawTrips }, { data: ownerRoleRow }] =
  await Promise.all([...existing four queries...])

// Step 2: fetch rates in parallel with the data already available
const rateMap: GbpRates = await buildGbpRates((expenses ?? []) as ExpenseWithCategory[])
```

This is still fast because `buildGbpRates` itself runs all its per-date fetch calls in parallel internally. The sequential step (Supabase → then frankfurter.app) adds only the network latency for the frankfurter.app calls, which are cached after the first request.

Pass `rateMap` to `<ExpenseList>`:

```tsx
<ExpenseList
  ...existing props...
  rateMap={rateMap}
/>
```

---

## 3. Frontend Tasks (T010–T012)

### T010 — Update `src/components/expenses/ExpenseList.tsx`

Add `rateMap` to the `Props` interface. Import `GbpRates` type from `@/lib/currencyConverter`:

```ts
import { GbpRates } from '@/lib/currencyConverter'

interface Props {
  initialExpenses: ExpenseWithCategory[]
  categories: ExpenseCategory[]
  trips: TripWithUsers[]
  canDelete: boolean
  ownerRole: UserRole
  expenseCount: number
  initialTripId?: string
  rateMap: GbpRates             // NEW — required prop
}
```

In the function body, destructure `rateMap` and thread it to the chart. Current line 77:

```tsx
<ExpenseCategoryChart expenses={expenses} categories={categories} />
```

Update to:

```tsx
<ExpenseCategoryChart expenses={expenses} categories={categories} rateMap={rateMap} />
```

No other changes to `ExpenseList.tsx` are needed.

### T011 — Update `src/components/expenses/ExpenseCategoryChart.tsx`

Add `rateMap` to the `Props` interface and import `GbpRates`:

```ts
import { GbpRates } from '@/lib/currencyConverter'

interface Props {
  expenses: ExpenseWithCategory[]
  categories: ExpenseCategory[]
  rateMap: GbpRates             // NEW — required prop
}
```

Update destructuring on line 13 (currently `{ rows, categoryColors, hasMultiCurrency }`):

```ts
const { rows, categoryColors, hasConvertedCurrencies, unconvertibleCount } =
  buildExpenseCategoryChartData(expenses, categories, rateMap)
```

### T012 — Update disclaimer label in `src/components/expenses/ExpenseCategoryChart.tsx`

Replace the existing disclaimer block (lines 46–50 in the current file):

```tsx
{hasMultiCurrency && (
  <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, marginBottom: 0 }}>
    Some expenses in other currencies are not shown in this chart.
  </p>
)}
```

With the three-state label below the `</ResponsiveContainer>` closing tag:

```tsx
{hasConvertedCurrencies && unconvertibleCount === 0 && (
  <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, marginBottom: 0 }}>
    All amounts converted to GBP.
  </p>
)}
{unconvertibleCount > 0 && (
  <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, marginBottom: 0 }}>
    Amounts converted to GBP where possible. {unconvertibleCount} expense{unconvertibleCount === 1 ? '' : 's'} in unsupported currencies are not shown.
  </p>
)}
```

When neither condition is true (all GBP, no conversions needed), no label is rendered.

Label copy decisions:
- "All amounts converted to GBP." — period, sentence case, no emoji.
- The partial label uses singular/plural: "1 expense" vs "2 expenses".
- No label shown for GBP-only chart (spec User Story 2, acceptance scenario 2: "no unnecessary noise").

**Placement**: both `<p>` tags go inside the outer `<div className="mb-8 overflow-x-auto">`, directly after the `</ResponsiveContainer>` closing tag, at the same nesting level as the existing disclaimer was.

---

## 4. Quality Tasks (T013–T016)

- **T013**: `npm run build` — the TypeScript errors most likely to appear are: (a) `rateMap` prop missing from `<ExpenseList>` call in `page.tsx` if T009 is incomplete, (b) `rateMap` prop missing from `<ExpenseCategoryChart>` call in `ExpenseList.tsx` if T010 is incomplete, (c) `hasMultiCurrency` still referenced in `ExpenseCategoryChart.tsx` if T003/T011 are applied out of order.
- **T014**: `npm run lint` — no new imports are likely to cause lint issues; verify no unused imports remain (e.g., `hasMultiCurrency` reference removed from destructure).
- **T015**: `npm test` — all pre-existing tests must still pass. New tests in `currencyConverter.test.ts` (T006) and `expenseChartData.test.ts` (T008) must pass. The `buildExpenseCategoryChartData` signature change (third param type changes from `string` to `GbpRates | undefined`) will break any existing test that passes `'GBP'` as the third argument — update those call sites in the test file.
- **T016**: Scan for `console.log` in: `src/lib/currencyConverter.ts`, `src/lib/expenseChartData.ts`, `src/app/expenses/page.tsx`, `src/components/expenses/ExpenseList.tsx`, `src/components/expenses/ExpenseCategoryChart.tsx`. None are permitted in production code per CLAUDE.md.

---

## 5. Conflicts With Existing Code

### Conflict 1: `hasMultiCurrency` used in two places simultaneously

`BuildExpenseCategoryChartDataResult.hasMultiCurrency` is currently produced in `src/lib/expenseChartData.ts` (line 18 of the interface, line 33 and line 70 of the function body) and consumed in `src/components/expenses/ExpenseCategoryChart.tsx` (line 13 destructure, line 46 JSX condition).

T003 removes `hasMultiCurrency` from the type. T011 removes it from the consumer. If T003 is applied without T011 (or vice versa), TypeScript will error. These two tasks must be applied atomically in the same editing pass or the build will be broken between them.

### Conflict 2: `buildExpenseCategoryChartData` third parameter type change

The current signature is `(expenses, categories, currency = 'GBP')` — the third argument is a `string`. T007 changes it to `(expenses, categories, rateMap?: GbpRates)`. Any existing test in `expenseChartData.test.ts` that calls `buildExpenseCategoryChartData(expenses, categories, 'GBP')` or `buildExpenseCategoryChartData(expenses, categories)` will need to be reviewed. Calls with the `'GBP'` string literal as the third argument will become a TypeScript type error (string is not assignable to `GbpRates | undefined`). T008 must update those call sites.

### Conflict 3: `ExpenseCategoryChart` is a client component receiving a new required prop

`ExpenseList.tsx` renders `<ExpenseCategoryChart>` on line 77. After T011 makes `rateMap` a required prop, the existing call site (line 77 of `ExpenseList.tsx`) will fail TypeScript until T010 adds the prop to `ExpenseList`'s own `Props` and threads it through. T010 and T011 must be applied together.

### Conflict 4: `ExpensesPage` `Promise.all` cannot include `buildGbpRates` in the same destructure

As noted in T009, `buildGbpRates(expenses)` needs the resolved `expenses` array, which cannot be available inside the same `Promise.all` that fetches it. The implementation must use a two-step await (Supabase data first, then `buildGbpRates`). If an agent attempts to inline `buildGbpRates` into the existing `Promise.all` they will need a placeholder or will get a reference error. The two-step pattern is the correct solution.

### Conflict 5: `GbpRates` import chain must exist before consumers

`ExpenseList.tsx` and `ExpenseCategoryChart.tsx` both import `GbpRates` from `@/lib/currencyConverter`. If T002 (creating that file) has not been applied, those import statements will cause a module-not-found build error. T002 must be the first task executed.
