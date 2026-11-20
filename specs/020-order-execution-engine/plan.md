# Implementation Plan: Production-grade Order Execution Engine

**Branch**: `claude/awesome-brahmagupta-pbgvsg` (no feature branch — orchestrated build) | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## Summary

Replace the synchronous execute route with an Inngest function. Pure planning/state logic lives in
`src/lib/tradeExecution.ts` (unit tested); Alpaca I/O is added to `src/lib/alpacaClient.ts`; the engine
(`src/inngest/executeTrades.ts`) orchestrates clock wait → sells → poll → capacity → buys → poll → cancel stale → finish.

## Technical Context

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Zod, Vitest, Inngest 4.4
- Alpaca Trading API: `/v2/clock`, `/v2/assets/{s}` (`fractionable`), `/v2/account` (`cash`,
  `non_marginable_buying_power`), `/v2/positions/{s}`, `/v2/orders` (POST with `notional|qty`, `client_order_id`;
  GET list with `after`/`symbols`), `/v2/orders/{id}`, `/v2/orders:by_client_order_id`, `DELETE /v2/orders/{id}`
- Storage: existing `alpaca_executions.orders jsonb` (envelope v2), no migration

## Constitution Check

| Principle | How it is met |
|---|---|
| I. Auth-first routes | execute + new GET executions/[id]: `getAuthUser()` → 401, `premium_plus` → 403 first |
| II. Zod at boundaries | request body, route param, Inngest event payload, stored envelope all parsed with Zod |
| III. Audit on writes | execute request logs `alpaca_executed` before returning 202 |
| IV. RBAC / guards | premium_plus, ownership, 409 (pre-check + unique constraint), Shariah buy guard kept and re-applied in engine |
| V. Pure tests | `tradeExecution.test.ts`: planning, scaling, client ids, status classification, clock decisions, envelope parsing |

## Design

```
POST /execute ──insert pending row (unique)──► inngest.send(portfolio/execution.requested) ──► 202
executeTrades:
  load-execution ─► [clock-N ─► sleepUntil(next_open+5m)]* ─► plan ─► submit-sell-* ─► poll/sleep 15s (≤30m)
  ─► cancel-stale-sells ─► buying-capacity (scale buys) ─► submit-buy-* (Shariah re-check) ─► poll (≤30m)
  ─► cancel-stale-buys ─► finish (derive status) ─► emit portfolio/execution.completed
```

Each step persists the whole envelope (the engine is the only writer after creation). Steps return order arrays so
in-memory state is rebuilt from memoised step outputs on replay. Credentials are loaded inside steps, never returned.

## Project Structure (touched)

```
src/lib/tradeExecution.ts (+ test)            pure planning/state + loadPlanInputs()
src/lib/tradeExecutionRequest.ts              requestExecution(): insert-first + send event
src/lib/alpacaClient.ts                       clock, asset, account capacity, order get/lookup/cancel, recent buys, notional submit
src/inngest/executeTrades.ts                  engine; registered in src/app/api/inngest/route.ts
src/app/api/portfolio/alpaca/{execute,preview}/route.ts, executions/[id]/route.ts
src/components/portfolio/{AlpacaExecuteButton,AlpacaOrderPreview,AlpacaResultsPanel,RecommendationDetail}.tsx
src/types/database.ts                         AlpacaOrderResult (optional fields), ExecutionStatus, envelope
```

## Complexity Tracking

None — no new tables, no migration.
