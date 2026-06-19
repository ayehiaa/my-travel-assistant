# Tasks: Alpaca Trade Execution

**Input**: Design documents from `specs/016-alpaca-trade-execution/`

**Branch**: `075-alpaca-trade-execution`

**User Stories**:
- **US1** (P1): Connect Alpaca Account
- **US2** (P1): Preview and Execute Trades
- **US3** (P2): View Persistent Execution Results

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: DB migration, new types, env var

- [ ] T001 Write DB migration `supabase/migrations/20260619_alpaca_trade_execution.sql` — `alpaca_credentials` + `alpaca_executions` tables with RLS policies (see `data-model.md`)
- [ ] T002 [P] Add `AlpacaCredential`, `AlpacaExecution`, `AlpacaOrderResult` interfaces and `alpaca_credentials_connected`, `alpaca_credentials_disconnected`, `alpaca_executed` to `AuditAction` union in `src/types/database.ts`
- [ ] T003 [P] Add `ALPACA_CREDENTIAL_ENCRYPTION_KEY` placeholder comment to `.env.local` (never commit the actual value)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Crypto, order calculation, and Alpaca API client — shared across all user stories

**⚠️ CRITICAL**: All Phase 3+ work depends on these being complete

- [ ] T004 Create `src/lib/alpacaCrypto.ts` — AES-256-GCM `encryptCredential(plaintext)` → `{ ciphertext, iv }` and `decryptCredential(ciphertext, iv)` → string, using `ALPACA_CREDENTIAL_ENCRYPTION_KEY`. Mirror `src/lib/gmailCrypto.ts` exactly.
- [ ] T005 Create `src/lib/alpacaOrderCalculator.ts` — export `computeOrderQty(deltaUsd: number, askPrice: number, positionQty: number | null, side: 'buy' | 'sell'): number` and `isNYSEOpen(): boolean`. Pure functions, no side effects.
- [ ] T006 Create `src/lib/alpacaOrderCalculator.test.ts` — Vitest tests for `computeOrderQty`: buy floor division, sell floor+cap at position qty, zero when qty rounds to 0, zero when delta is 0. Tests for `isNYSEOpen`: returns false on weekends, false before 9:30 ET, false after 16:00 ET, true at 10:00 ET on a weekday.
- [ ] T007 Create `src/lib/alpacaClient.ts` — exports: `getAlpacaBaseUrl(isPaper: boolean): string`, `fetchQuotes(tickers: string[], keyId: string, secret: string, isPaper: boolean): Promise<Record<string, number>>` (returns ticker→askPrice map), `fetchPosition(ticker: string, keyId: string, secret: string, isPaper: boolean): Promise<number>` (returns qty held, 0 on 404), `submitOrder(order: { symbol, qty, side, type, time_in_force }, keyId: string, secret: string, isPaper: boolean): Promise<{ alpaca_order_id: string; status: string; error_message: string | null }>`.

**Checkpoint**: Run `npm test` — all T006 tests must pass before continuing

---

## Phase 3: User Story 1 — Connect Alpaca Account (P1) 🎯 MVP

**Goal**: User can connect and disconnect Alpaca credentials from `/portfolio/settings`

**Independent Test**: Visit `/portfolio/settings`, paste a paper trading key ID + secret, click Connect → card shows "Connected (Paper)". Reload → still shows "Connected". Click Disconnect → returns to input form.

### Implementation for User Story 1

- [ ] T008 [US1] Create `src/app/api/portfolio/alpaca/credentials/route.ts` — `POST` handler: auth check → role check → Zod validate `{ key_id, secret_key, is_paper }` → encrypt both values with `alpacaCrypto` → upsert into `alpaca_credentials` → `logAudit('alpaca_credentials_connected')` → return `{ connected: true, is_paper }`. `DELETE` handler: auth check → role check → delete row → `logAudit('alpaca_credentials_disconnected')` → 204.
- [ ] T009 [P] [US1] Create `src/components/portfolio/AlpacaCredentialsForm.tsx` — `'use client'` component. Props: `initialConnected: boolean`, `initialIsPaper: boolean`. If connected: shows green "Connected (Paper/Live)" badge + Disconnect button. If not connected: shows key ID input, secret key input (type=password), paper toggle (default on), Connect button. Calls `POST /api/portfolio/alpaca/credentials` on connect, `DELETE` on disconnect. Toast on success/error. Mirrors `PortfolioSettingsForm.tsx` visual style (inline styles, same input/button patterns).
- [ ] T010 [US1] Update `src/app/portfolio/settings/page.tsx` — after fetching `settings`, also query `alpaca_credentials` table for this user (select `is_paper` only — never fetch encrypted values). Pass `connected: boolean` and `isPaper: boolean` as props to a new `AlpacaCredentialsForm` rendered in a second card below `PortfolioSettingsForm`.

**Checkpoint**: User Story 1 fully testable. Connect/disconnect flow works end-to-end.

---

## Phase 4: User Story 2 — Preview and Execute Trades (P1)

**Goal**: User sees "Execute trades" button on most recent recommendation, opens preview modal with live prices, confirms, orders execute on Alpaca

**Independent Test**: With credentials connected and a complete recommendation, click "Execute trades (PAPER)" → modal shows table with qty/price/value. Click Confirm → orders submitted to Alpaca paper account. Verify orders appear in Alpaca dashboard.

### Implementation for User Story 2

- [ ] T011 [US2] Create `src/app/api/portfolio/alpaca/preview/route.ts` — `POST` handler: auth check → role check → Zod validate `{ recommendation_id }` → load recommendation (verify ownership) → check no existing `alpaca_executions` row (409 if exists) → load + decrypt credentials (404 if missing) → fetch quotes for all non-hold tickers via `alpacaClient.fetchQuotes` → for each sell ticker fetch position via `alpacaClient.fetchPosition` → compute qty for each item via `alpacaOrderCalculator.computeOrderQty` → compute `isNYSEOpen()` → return preview array + `is_market_open` + `is_paper`.
- [ ] T012 [US2] Create `src/app/api/portfolio/alpaca/execute/route.ts` — `POST` handler: auth check → role check → Zod validate `{ recommendation_id }` → load recommendation → check no existing execution (409) → load + decrypt credentials → fetch quotes + positions → compute qtys → filter to non-skipped non-hold items → submit sells sequentially via `alpacaClient.submitOrder`, then buys sequentially → insert `alpaca_executions` row (admin client) with all order results → `logAudit('alpaca_executed')` → return execution record.
- [ ] T013 [P] [US2] Create `src/components/portfolio/AlpacaOrderPreview.tsx` — table component rendering preview rows: ticker | action badge | qty (or "—" if skipped) | price | estimated value. Skipped rows greyed out with "Too small to execute" in qty column. `hold` items not shown. Accepts `preview: OrderPreviewItem[]` prop.
- [ ] T014 [US2] Create `src/components/portfolio/AlpacaExecuteButton.tsx` — `'use client'` component. Props: `recommendationId: string`, `hasCredentials: boolean`, `isPaper: boolean`, `isLatest: boolean`, `alreadyExecuted: boolean`, `executedAt: string | null`. Renders: (a) if `!isLatest`: nothing; (b) if `alreadyExecuted`: disabled "Executed on [date]" button with PAPER badge; (c) if `!hasCredentials`: disabled button with "Connect Alpaca in Settings →" link; (d) otherwise: active "Execute trades" button with PAPER badge. On click: open modal → POST `/api/portfolio/alpaca/preview` → render `AlpacaOrderPreview` + market hours warning banner → "Confirm & Execute" button → POST `/api/portfolio/alpaca/execute` → on success close modal and trigger page refresh to show results panel.
- [ ] T015 [US2] Update `src/app/portfolio/recommendations/[id]/page.tsx` — after fetching the recommendation: (1) query `SELECT id FROM recommendations WHERE user_id = $1 AND status = 'complete' ORDER BY run_at DESC LIMIT 1` to determine if this is the latest; (2) query `alpaca_executions` for this recommendation_id; (3) query `alpaca_credentials` for `is_paper` status. Pass all four flags (`isLatest`, `execution`, `hasCredentials`, `isPaper`) to an updated `RecommendationDetail`.
- [ ] T016 [US2] Update `src/components/portfolio/RecommendationDetail.tsx` — accept `isLatest: boolean`, `hasCredentials: boolean`, `isPaper: boolean`, `execution: AlpacaExecution | null`, `recommendationId: string` as props. Render `<AlpacaExecuteButton>` below the "Recommended Actions" section heading (before the `<ActionList>`).

**Checkpoint**: User Story 2 fully testable. Execute button appears, modal opens with live prices, orders submitted to Alpaca.

---

## Phase 5: User Story 3 — Persistent Execution Results (P2)

**Goal**: After execution, a permanent results panel appears on the recommendation page and survives page reload

**Independent Test**: Execute trades, then hard-reload the page → results panel still visible with correct per-order statuses and Alpaca order IDs.

### Implementation for User Story 3

- [ ] T017 [US3] Create `src/components/portfolio/AlpacaResultsPanel.tsx` — server-renderable component. Props: `execution: AlpacaExecution`. Renders a card below "Recommended Actions": heading "Execution Results", PAPER badge if `is_paper`, `executed_at` formatted date, table of orders: ticker | action | qty | status chip (green "Submitted" / red "Rejected" / grey "Error") | Alpaca order ID (monospace). Error message shown as sub-row if present.
- [ ] T018 [US3] Update `src/components/portfolio/RecommendationDetail.tsx` — render `<AlpacaResultsPanel execution={execution} />` immediately below `<AlpacaExecuteButton>` when `execution !== null`. The results panel always renders server-side from the pre-fetched execution prop (no client-side fetch needed).

**Checkpoint**: User Story 3 fully testable. Execution record persists and renders correctly on reload.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T019 [P] Run `npm run build` — fix any TypeScript type errors
- [ ] T020 [P] Run `npm test` — all tests green (T006 suite must pass)
- [ ] T021 [P] Run `npm run lint` — zero ESLint warnings
- [ ] T022 Verify no `console.log` left in any new or modified file
- [ ] T023 [P] Verify `ALPACA_CREDENTIAL_ENCRYPTION_KEY` is documented in `specs/016-alpaca-trade-execution/quickstart.md` and NOT committed to `.env.local` in the PR

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — T001/T002/T003 can all start immediately in parallel
- **Phase 2 (Foundational)**: Depends on T001 (types in T002 needed by T004/T007). T004, T005, T006, T007 can run in parallel once T002 is done.
- **Phase 3 (US1)**: Depends on Phase 2 complete. T008, T009 can run in parallel; T010 depends on T009.
- **Phase 4 (US2)**: Depends on Phase 2 + Phase 3 complete. T011, T012, T013 can run in parallel; T014 depends on T013; T015 depends on T014; T016 depends on T015.
- **Phase 5 (US3)**: Depends on Phase 4 (T016 already updated RecommendationDetail). T017 can run in parallel with T014.
- **Phase 6 (Polish)**: Depends on all phases complete.

### Parallel Opportunities

```
Phase 1 parallel:    T001 ‖ T002 ‖ T003
Phase 2 parallel:    T004 ‖ T005+T006 ‖ T007  (after T002)
Phase 3 parallel:    T008 ‖ T009              (after Phase 2)
Phase 4 parallel:    T011 ‖ T012 ‖ T013       (after Phase 3)
Phase 5 parallel:    T017 can start with T013  (after T002)
Phase 6 parallel:    T019 ‖ T020 ‖ T021 ‖ T022 ‖ T023
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 → Phase 2 → Phase 3
2. Validate: credential connect/disconnect works on `/portfolio/settings`
3. Deploy to preview

### Incremental Delivery

1. Foundation + US1 → credentials working
2. Add US2 → trade execution working (sells before buys, modal, orders on Alpaca)
3. Add US3 → persistent results panel

---

## Notes

- `alpacaClient.ts` uses `fetch` (built-in Node.js 18+) — no extra HTTP library needed
- `computeOrderQty` never returns negative — always ≥ 0
- The preview and execute routes both decrypt credentials and compute qtys independently (no shared state between the two calls) — price may drift slightly between modal open and confirm; this is acceptable for paper trading
- `logAudit()` uses `null` for `trip_id` and `trip_snapshot` (same as existing portfolio audit calls)
