# Tasks: GBP-Normalised Expense Chart

**Input**: Design documents from `specs/014-gbp-expense-chart/`

**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅

**Organization**: Tasks grouped by user story for independent implementation.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new packages or config needed — frankfurter.app is called via native `fetch`.

- [ ] T001 Verify `fetch` is available in the Next.js 16 server component context (no polyfill needed — confirm in `package.json` / Next.js version)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the `GbpRates` type and update `BuildExpenseCategoryChartDataResult` before any component work touches them.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 Create `src/lib/currencyConverter.ts` — define and export `GbpRates` type (`Record<string, Record<string, number>>`), and export empty stub `buildGbpRates` function signature (returns `Promise<GbpRates>`)
- [ ] T003 Update `BuildExpenseCategoryChartDataResult` in `src/lib/expenseChartData.ts` — remove `hasMultiCurrency: boolean`, add `hasConvertedCurrencies: boolean` and `unconvertibleCount: number`

**Checkpoint**: Types are stable — US1 and US2 implementation can begin.

---

## Phase 3: User Story 1 — All expenses shown in chart (Priority: P1) 🎯 MVP

**Goal**: Every expense appears in the chart, with non-GBP amounts converted to GBP at the historical rate for each expense date using frankfurter.app.

**Independent Test**: Add one GBP expense and one USD expense. Open `/expenses`. Both appear in the chart bars. The USD amount is visibly converted (different from raw USD value).

### Implementation

- [ ] T004 [US1] Implement `buildGbpRates(expenses)` in `src/lib/currencyConverter.ts`:
  - Group non-GBP expenses by unique `expense_date`
  - For each unique date, call `GET https://api.frankfurter.app/{date}?from=GBP&to={currencies}` (one call per date, all currencies in one request)
  - If a date returns 404 (weekend/holiday), retry with `/latest` endpoint
  - Cache historical rates with `next: { revalidate: 31536000 }` and today's rates with `next: { revalidate: 3600 }`
  - On error for a date, log nothing (silent fail per constitution) and skip that date's expenses
  - Return `GbpRates` — `Record<date, Record<currency, multiplier>>` where `multiplier = 1 / rate`
- [ ] T005 [US1] Add pure helper `convertAmountToGbp(amount, currency, date, rates: GbpRates): number | null` in `src/lib/currencyConverter.ts` — returns `null` if rate not available
- [ ] T006 [US1] Write unit tests in `src/lib/currencyConverter.test.ts` for `convertAmountToGbp` pure helper — test: GBP passthrough, known rate conversion, missing rate returns null
- [ ] T007 [US1] Update `buildExpenseCategoryChartData` in `src/lib/expenseChartData.ts` to accept optional `rateMap: GbpRates` third argument — when provided, convert non-GBP expenses using `convertAmountToGbp`; increment `unconvertibleCount` for each expense with no available rate; set `hasConvertedCurrencies = true` when at least one expense was converted
- [ ] T008 [US1] Update unit tests in `src/lib/expenseChartData.test.ts` — add cases: all GBP (no change), mixed currencies with rates (converted), mixed with missing rate (unconvertible count)
- [ ] T009 [US1] Update `src/app/expenses/page.tsx` — call `buildGbpRates(expenses ?? [])` in parallel with existing Supabase queries (`Promise.all`), pass result as `rateMap` prop to `<ExpenseList>`
- [ ] T010 [US1] Update `src/components/expenses/ExpenseList.tsx` — add `rateMap: GbpRates` to `Props` interface, thread it through to `<ExpenseCategoryChart rateMap={rateMap} />`
- [ ] T011 [US1] Update `src/components/expenses/ExpenseCategoryChart.tsx` — add `rateMap: GbpRates` prop, pass it to `buildExpenseCategoryChartData(expenses, categories, rateMap)`

**Checkpoint**: All expenses (any currency) are included in chart bars. GBP-only users see no change.

---

## Phase 4: User Story 2 — Conversion label visible (Priority: P2)

**Goal**: When conversion is active the chart clearly labels "All amounts converted to GBP". When some expenses could not be converted, a specific note explains how many were excluded.

**Independent Test**: With a mixed-currency setup, the label "All amounts converted to GBP" is visible below the chart. Remove the exchange rate (simulate failure) and verify a fallback note appears instead.

### Implementation

- [ ] T012 [P] [US2] Update `src/components/expenses/ExpenseCategoryChart.tsx` — replace `hasMultiCurrency` disclaimer with:
  - If `hasConvertedCurrencies && unconvertibleCount === 0`: show `"All amounts converted to GBP"`
  - If `unconvertibleCount > 0`: show `"Amounts converted to GBP where possible. {unconvertibleCount} expense(s) in unsupported currencies are not shown."`
  - If neither: show nothing (GBP-only, no noise)

**Checkpoint**: Label is correct for all three states (all converted, partial, GBP-only).

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T013 [P] Run `npm run build` and fix any TypeScript errors introduced by the `GbpRates` prop threading through `ExpenseList` and `ExpenseCategoryChart`
- [ ] T014 [P] Run `npm run lint` and fix any ESLint warnings
- [ ] T015 [P] Run `npm test` and confirm all tests pass (including new T006 and T008 tests)
- [ ] T016 Verify no `console.log` statements were introduced in `currencyConverter.ts`, `expenseChartData.ts`, `page.tsx`, `ExpenseList.tsx`, or `ExpenseCategoryChart.tsx`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** (Setup): No dependencies — can start immediately
- **Phase 2** (Foundational): Depends on Phase 1 — BLOCKS all user story work
- **Phase 3** (US1): Depends on Phase 2 — core conversion logic
- **Phase 4** (US2): Depends on Phase 3 (needs `hasConvertedCurrencies` and `unconvertibleCount` from T007)
- **Phase 5** (Polish): Depends on Phase 4 — quality gates

### Within Phase 3

- T004 (buildGbpRates) → T005 (convertAmountToGbp) → T006 (tests) can all precede T007
- T007 (expenseChartData update) → T008 (expenseChartData tests)
- T009 (page.tsx) depends on T004 being complete
- T010 (ExpenseList) depends on T009
- T011 (ExpenseCategoryChart) depends on T010

### Parallel Opportunities

- T006 and T008 (test files) can be written in parallel once T005 and T007 are done
- T013, T014, T015, T016 can all run in parallel (Phase 5)

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1 + Phase 2 (types)
2. Complete Phase 3 (T004–T011) — all expenses appear in chart
3. **Validate**: Add a USD expense, check it appears in chart
4. Proceed to Phase 4 (label)

### Incremental

1. Foundation (T001–T003)
2. Converter + chart logic (T004–T008)
3. Page → component threading (T009–T011)
4. Label (T012)
5. Quality gates (T013–T016)

---

## Notes

- No new npm packages required — `fetch` is native
- No DB migrations required
- `GbpRates` must be a plain object (not `Map`) to cross the server→client prop boundary
- Historical rates never change — the 1-year `revalidate` means each unique date is fetched at most once per year per deployment
