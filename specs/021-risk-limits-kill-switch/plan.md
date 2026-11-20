# Implementation Plan: 021 Risk Limits, Kill Switch, Dry Run

## Technical context
Next.js 16 App Router, Supabase, Inngest (`src/inngest/executeTrades.ts`), Alpaca REST, Zod, Vitest, Tailwind.

## Constitution check
- Auth first, `premium_plus` role, Zod at every boundary, `logAudit` on every write route — yes (pause, resume, settings).
- Pure functions tested next to the file — `src/lib/riskLimits.test.ts`, additions to `tradeExecution.test.ts`.
- Existing guards untouched: 409 re-execution (UNIQUE constraint), Shariah buy guard (planner + pre-submit re-check),
  ownership checks. Dry-run rows are the only rows a new request may replace, and only via a conditional delete.

## Design
### Pure (`src/lib/riskLimits.ts`)
- `RiskLimits`, `DEFAULT_RISK_LIMITS`, `RiskLimitsSchema` (bounded Zod), `resolveRiskLimits(raw)`.
- `readSafetySettings(row)` → `{ limits, dry_run, trading_paused, paused_reason, paused_at, migration_applied }`.
- `isForcedShariahSell(item, screening)`, `forcedSellTickers(items, screening)`.
- `resizeOrder(order, targetUsd, note)` (never increases), `orderValueUsd`.
- `applyRiskLimits(plan, account, limits)` → `{ orders, adjustments, summary }`.
- `pickWeekStartEquity(history)`, `evaluateLossStops(input, limits)`, `bufferedBuyingCapacity(...)`.

### Shared planner (`src/lib/tradeExecution.ts`)
- `buildRiskCheckedPlan(creds, { executionId, items, screening, limits })` = `loadPlanInputs` + `loadRiskAccount`
  + `planOrders` + `applyRiskLimits`. Used by preview and engine.
- Types: `ExecutionStatus` += `cancelled`, `dry_run_completed`; `AlpacaOrderStatus` += `simulated`;
  `AlpacaOrderResult.risk_note`; envelope `dry_run`. Terminal statuses updated; Zod envelope schema updated.
- `markSimulated`, `haltOrders` pure helpers.

### I/O
- `alpacaClient.ts`: `fetchEquitySnapshot` (equity, last_equity, cash), `fetchWeeklyEquityHistory`,
  `cancelAllOpenOrders`; `fetchBuyingInputs` also returns equity.
- `src/lib/tradingSafety.ts`: `loadSafetySettings`, `setTradingPause`, `cancelInFlightExecutions`,
  `checkLossStops(creds, limits)`.

### Engine (`src/inngest/executeTrades.ts`)
load (+ safety settings, paused → cancel) → [dry run skips market wait] → plan (risk-checked) → dry run: simulate &
finish → safety check (pause, row cancelled, loss stops) → sells (halt check per submit) → poll → safety check → size
buys (cash buffer on settled capacity) → buys (halt + Shariah check per submit) → poll → finish.
`persist` is conditional (`orders->>status <> 'cancelled'`) except when writing `cancelled`.

### API / UI
- `POST /api/portfolio/trading/pause`, `/resume`; settings PUT extended; execute 423 when paused; preview returns risk
  adjustments, summary, loss stop, dry_run, trading_paused.
- `RiskSafetyCard` (settings), `TradingStatusBanner` (portfolio page), preview + results panel labels.

### Migration
`supabase/migrations/20261120c_risk_limits_kill_switch.sql`: 5 new `portfolio_settings` columns + audit action
constraint with the full list.
