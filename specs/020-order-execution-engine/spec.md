# Feature Specification: Production-grade Order Execution Engine

**Feature directory**: `specs/020-order-execution-engine` | **Date**: 2026-11-20 | **Phase**: 2 of 6
**Status**: Implemented

## Summary

Clicking "Confirm & Execute" used to submit whole-share market orders synchronously inside an API request, blind to
market hours, buying power, settlement and fills. This feature moves execution into a background Inngest function
(`portfolio/execution.requested`) that is safe to run unattended — the foundation phases 3 (risk limits) and 4
(autopilot) build on. Buys become dollar-amount (notional) fractional orders, everything waits for the regular
session, sells settle before buys are sized to real settled buying power, every order is tracked to a terminal state,
and every submission is idempotent through a deterministic Alpaca `client_order_id`.

## User Stories

### US1 — Execution runs in the background (P1)
As an owner I click Confirm & Execute and immediately get a confirmation; the trades run in the background.
- The execute API keeps auth (401), `premium_plus` (403), Zod (400), ownership (400 "not found") and the 409
  re-execution guard, creates the `alpaca_executions` row with status `pending`, sends the Inngest event and returns
  **202** `{ execution_id, status: 'pending' }`.
- Concurrent clicks: the row is inserted first; the existing `UNIQUE (recommendation_id)` constraint turns the second
  insert into **409**. If the event cannot be sent the row is deleted and the API returns 502 (nothing was traded).
- `src/lib/tradeExecution.ts` holds all planning logic (pure + Alpaca-input loader) so later phases can plan and
  request executions without HTTP (`requestExecution()` in `src/lib/tradeExecutionRequest.ts`).

### US2 — Small accounts can trade (P1)
- BUY: Alpaca `notional` (USD, floored to 2dp) when the asset is `fractionable`; below the $1 Alpaca minimum → skipped
  with a reason. Non-fractionable assets fall back to whole shares (`floor(delta / ask)`).
- SELL: by `qty` (fractional allowed, floored to 6dp, capped at the held qty). When the target weight is 0% the full
  held qty is sold so no dust remains. Partial sells worth < $1 are skipped.

### US3 — Market hours (P1)
- Orders are only submitted while the market is open per Alpaca `/v2/clock`.
- Closed (or < 35 minutes to the close) → status `waiting_for_market`, `step.sleepUntil(next_open + 5 min)`; total wait
  capped at 4 days after which the execution fails with a clear message.

### US4 — Settlement-aware sequencing (P1)
- All SELLs are submitted first and polled every 15s until terminal (timeout 30 min; still-open sells are cancelled).
- Buying capacity = `min(cash, non_marginable_buying_power)` from `/v2/account` (never margin `buying_power`; the
  account is Islamic / cash-only). Buys are scaled down proportionally when they exceed it.
- Good-faith-violation (GFV) mitigation: a position is never SOLD if the account bought that symbol within the last
  2 business days (checked via `/v2/orders?status=all&after=…&symbols=…`); the sell is skipped with a reason.

### US5 — Fill tracking (P1)
- Every order is recorded with lifecycle status `submitted → partially_filled → filled | canceled | rejected | expired`
  plus `filled_qty`, `filled_avg_price`, `filled_at`, `client_order_id`, `notional`.
- Execution status: `pending | waiting_for_market | executing | completed | completed_with_errors | failed`.
- After the polling timeout, still-open orders are cancelled and marked `canceled` with a note.

### US6 — Idempotency (P1)
- `client_order_id = ${execution_id}-${ticker}-${side}` (≤ 48 chars; otherwise `${execution_id}-${fnv1a(ticker-side)}`).
- Before every submission the engine looks the id up via `/v2/orders:by_client_order_id`; Inngest retries can never
  double-submit. Each order is submitted in its own memoised step.

### US7 — Shariah guard in the engine (P1)
- `getBuyBlockReason` is applied when planning AND again immediately before every BUY submission.

### US8 — Live UI (P2)
- Preview shows dollar amounts for buys and share qty for sells, plus "Buys are sized to settled cash after sells fill".
- After confirming, the results panel polls `GET /api/portfolio/alpaca/executions/[id]` (auth + role + ownership) every
  4s while the execution is not terminal, showing the execution status ("Waiting for market open", "Executing",
  "Completed"…) and per-order chips with filled qty / avg price.

## Decisions made autonomously

1. **Market orders, in session only** (not marketable limits). Alpaca notional orders only accept `market` or `limit`
   with `time_in_force=day`, and only in the regular session. A marketable limit on a notional order would need a price
   collar per ticker and creates partial/unfilled leftovers that need extra re-pricing logic; for liquid common stocks
   in the regular session (avoiding the first 5 minutes after the open and the last 35 minutes before the close) the
   spread cost is small and fills are near-certain. A collar can be added later in `planOrders` without schema changes.
2. **No migration.** `alpaca_executions.orders` (jsonb) now stores an envelope
   `{ version: 2, status, updated_at, error_message, orders: [...] }`. Old rows (a bare array) are read as
   `completed`. `normalizeExecution()` handles both shapes everywhere (page, API, engine).
3. **Insert-first 409**: the pre-check stays (fast path), the unique constraint is the real guard against races.
4. **If sending the Inngest event fails** the pending row is deleted (no orders exist yet) so the user can retry.
5. **GFV window = 2 business days** (weekends skipped, US holidays not modelled — T+1 plus one day of margin covers a
   single holiday). Any buy (any status with a fill, or still open) of the symbol in that window blocks its sale.
   Within one execution, sells always come before buys so the run never sells what it just bought.
6. **Sells that time out still let buys proceed**, because buys are sized from the account's real settled capacity at
   that moment, never from expected proceeds.
7. **Whole-share buys reserve a 1% slippage buffer** when scaling to buying power; notional buys consume exactly their
   notional.
8. **Retries**: Inngest `retries: 3`, `idempotency: event.data.execution_id`, concurrency 1 per user. `onFailure`
   marks the execution `failed` with a sanitised message. Credentials are never returned from a step (they are
   re-loaded inside each step so they never land in Inngest step state).
9. **Engine re-validates** that the execution row belongs to the event's `user_id` and `recommendation_id`; terminal
   executions are not re-run.
10. Audit: the request is audited (`alpaca_executed`) by the API at request time; no new audit actions → no audit
    constraint migration.
11. A `portfolio/execution.completed` event is emitted at the end for later phases.

## Out of scope
- Risk limits (phase 3), autopilot scheduling (phase 4), limit-order collars, extended-hours trading.

## Good-faith-violation risk (cash account) — notes

In a cash account, proceeds of a sale are usable for buys immediately but settle T+1. Buying with unsettled proceeds
is allowed; a **good-faith violation** occurs if the security bought with those unsettled funds is then sold before
the funds settle. Mitigation implemented: before planning any SELL the engine lists the account's orders since the
start of the day two business days ago (`settlementLookbackStart`) for the sell symbols and skips (with a reason)
any symbol that has a filled, partially filled or still-working BUY in that window. If that lookup fails, sells are
skipped (conservative). Buys are sized from `min(cash, non_marginable_buying_power)`, never margin buying power.

## Verification

- `npm test`: 23 files / 287 tests pass (45 new in `src/lib/tradeExecution.test.ts`)
- `npm run lint`: 0 errors (1 pre-existing warning: unused `isPaper` in `fetchQuotes`)
- `npm run build`: passes
- Not exercised against Alpaca (no credentials in the build environment; never place real orders from here).
