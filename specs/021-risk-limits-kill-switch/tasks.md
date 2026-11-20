# Tasks: 021 Risk Limits, Kill Switch, Dry Run

## Foundation
- [x] T1 Migration `20261120c_risk_limits_kill_switch.sql` (columns + full audit constraint)
- [x] T2 Types: `AuditAction` (+3), `ExecutionStatus` (+cancelled, dry_run_completed), `AlpacaOrderStatus` (+simulated), `risk_note`, envelope `dry_run`, `PortfolioSettings` optional safety columns

## Pure logic (tested)
- [x] T3 `src/lib/riskLimits.ts` + `riskLimits.test.ts`: defaults/schema/resolve, readSafetySettings, forced sells, resizeOrder, applyRiskLimits (all 6 steps, never-increase), loss stops, buffered capacity
- [x] T4 `tradeExecution.ts`: new statuses in terminal list + Zod, envelope dry_run, `markSimulated`, `haltOrders` (+ tests)

## I/O + engine
- [x] T5 `alpacaClient.ts`: equity snapshot, weekly history, cancel all orders, equity in buying inputs
- [x] T6 `src/lib/tradingSafety.ts`: load settings, set pause, cancel in-flight executions, check loss stops
- [x] T7 `buildRiskCheckedPlan` shared planner
- [x] T8 Engine: dry run, halt checks (pause / cancelled row / loss stops) before sells and buys and per submit, conditional persist, cash buffer at size-buys
- [x] T9 `requestExecution`: refuse while paused; replace dry-run rows

## API
- [x] T10 `POST /api/portfolio/trading/pause` + `/resume`
- [x] T11 Settings PUT: risk_limits + dry_run (confirm text), best-effort write + warning, audit
- [x] T12 Preview: risk-checked plan + adjustments + loss stop + flags; execute: 423 when paused, dry-run rows not 409

## UI
- [x] T13 `RiskSafetyCard` on settings page
- [x] T14 `TradingStatusBanner` on portfolio page (paused banner, DRY RUN badge, migration warning)
- [x] T15 Preview modal + results panel: DRY RUN labels, risk notes, cancelled / simulated chips, disabled confirm when blocked

## Quality gate
- [x] Q1 `npm run build`, `npm test`, `npm run lint`; no console.log
