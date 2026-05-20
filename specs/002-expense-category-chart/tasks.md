# Tasks: Monthly Expense Category Chart

**Input**: Design documents from `specs/002-expense-category-chart/`

**Prerequisites**: plan.md ✓ | spec.md ✓ | research.md ✓ | data-model.md ✓ | quickstart.md ✓

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase
- **[Story]**: User story this task belongs to (US1/US2/US3)

---

## Phase 1: Setup

**Purpose**: Introduce the only new dependency (Recharts). No other infrastructure changes needed.

- [ ] T001 Install recharts — run `npm install recharts` and verify `package.json` lists `recharts` under `dependencies`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure aggregation function and types that the chart component depends on. Must be complete before Phase 3.

⚠️ **CRITICAL**: T002 and T003 must both complete before any chart component work begins.

- [ ] T002 Create `src/lib/expenseChartData.ts` — export `CATEGORY_COLORS` (12-item hex array), `ChartRow` interface (`{ month: string; label: string; [categoryId: string]: number | string }`), `BuildExpenseCategoryChartDataResult` interface (`{ rows: ChartRow[]; categoryColors: Record<string, string>; hasMultiCurrency: boolean }`), and `buildExpenseCategoryChartData(expenses: ExpenseWithCategory[], categories: ExpenseCategory[], currency?: string): BuildExpenseCategoryChartDataResult`. Logic: (1) filter expenses to currency (default 'GBP'), set hasMultiCurrency if others exist; (2) sort categories by display_order and assign categoryColors by palette index; (3) group filtered expenses by expense_date.slice(0,7) → sort months chronologically; (4) for each month build a ChartRow with summed amounts per category (0 if absent); (5) return result.

- [ ] T003 [P] Write unit tests in `src/lib/expenseChartData.test.ts` covering: empty expenses → empty rows + hasMultiCurrency false; single month single category → correct amount; multiple months multiple categories → correct row count sorted chronologically; multi-currency input → hasMultiCurrency true, only target-currency rows; category with no expenses in a month → amount is 0; color assignment → first category gets CATEGORY_COLORS[0], second gets CATEGORY_COLORS[1]. Run `npm test` and confirm all pass.

**Checkpoint**: `npm test` passes — chart component implementation can now begin.

---

## Phase 3: User Story 1 — View Monthly Category Breakdown (Priority: P1) 🎯 MVP

**Goal**: Stacked bar chart renders on the Expenses page with correctly coloured, correctly labelled segments, tooltip on hover, and legend.

**Independent Test**: Navigate to `/expenses` with GBP expenses across ≥2 categories and ≥2 months → chart renders with distinct coloured segments, legend, and tooltip.

- [ ] T004 [US1] Create `src/components/expenses/ExpenseCategoryChart.tsx` — `'use client'` component accepting `{ expenses: ExpenseWithCategory[]; categories: ExpenseCategory[] }`. Call `buildExpenseCategoryChartData(expenses, categories)`. If `rows` is empty render the US2 empty state (see Phase 4). Otherwise render: `<ResponsiveContainer width="100%" height={280}>` containing `<BarChart data={rows}>` with `<XAxis dataKey="label" tick={{ fontSize: 11 }}/>`, `<YAxis tickFormatter={v => v >= 1000 ? \`£\${(v/1000).toFixed(1)}k\` : \`£\${v}\`} width={55}/>`, `<Tooltip formatter={(value, name) => [\`£\${Number(value).toFixed(2)}\`, categories.find(c => c.id === name)?.name ?? name]}/>`, `<Legend formatter={name => categories.find(c => c.id === name)?.name ?? name}/>`, and one `<Bar key={cat.id} dataKey={cat.id} stackId="a" fill={categoryColors[cat.id]}/>` per category. Use Tailwind wrapper `div` with `mb-8` margin. Import types from `@/types/database` and function from `@/lib/expenseChartData`.

- [ ] T005 [US1] Update `src/components/expenses/ExpenseList.tsx` — import `ExpenseCategoryChart` from `./ExpenseCategoryChart`; add `<ExpenseCategoryChart expenses={expenses} categories={categories} />` as the first element inside the fragment return, before the near-limit banner. Use the unfiltered `expenses` state (not `filteredExpenses`).

---

## Phase 4: User Story 2 — No Expenses Empty State (Priority: P2)

**Goal**: When `rows` is empty (no GBP expenses loaded), chart area shows a descriptive message rather than blank axes.

**Independent Test**: Log in with an account with zero expenses → chart area shows "No expenses to display yet" message.

- [ ] T006 [US2] In `src/components/expenses/ExpenseCategoryChart.tsx` — add the empty-state branch: when `rows.length === 0`, render a `div` styled with `border-2 border-dashed border-[var(--rule)] rounded-xl py-10 text-center mb-8` containing `<p className="text-sm text-[var(--ink-3)] font-medium m-0">No expenses to display yet</p>`. (This is referenced in T004 — ensure the branch is wired to the early return before the chart JSX.)

---

## Phase 5: User Story 3 — Currency-Aware Amounts (Priority: P3)

**Goal**: When expenses in non-GBP currencies exist in the loaded set, a small informational note is shown below the chart.

**Independent Test**: Add one USD and one GBP expense → chart shows GBP data and a note like "X expenses in other currencies are not shown in this chart."

- [ ] T007 [US3] In `src/components/expenses/ExpenseCategoryChart.tsx` — below the closing `</ResponsiveContainer>`, conditionally render `{hasMultiCurrency && (<p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, marginBottom: 0 }}>Some expenses in other currencies are not shown in this chart.</p>)}`.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T008 Run `npm test` — confirm all `expenseChartData.test.ts` tests pass with no regressions in other test files.
- [ ] T009 [P] Run `npm run build` — confirm zero TypeScript type errors. Fix any type errors in `expenseChartData.ts` or `ExpenseCategoryChart.tsx` before proceeding.
- [ ] T010 [P] Run `npm run lint` — confirm zero ESLint warnings or errors. Fix any issues found.
- [ ] T011 [P] Verify no `console.log` statements remain in any new or modified file.

---

## Dependencies

```
T001 → T002 → T003
             T002 → T004 → T005
             T002 → T006 (fills the empty-state branch referenced in T004)
             T002 → T007
T005, T006, T007 → T008, T009, T010, T011
```

US1 (T004, T005) depends on the foundational aggregation function (T002).
US2 (T006) fills the empty-state branch declared in T004 — implement together or immediately after.
US3 (T007) is independent of US2; both depend on T002.

## Parallel Execution

T003 can run in parallel with T002 (test stubs can be written before the implementation).
T009, T010, T011 can run in parallel once all implementation tasks are done.

## Implementation Strategy

**MVP** (T001 → T002 → T003 → T004 → T005): Delivers the core chart with all categories coloured and labelled.
**P2 addition** (T006): Empty state — small addition to the component already created.
**P3 addition** (T007): Currency note — one conditional `<p>` element.
