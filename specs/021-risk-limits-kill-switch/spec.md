# Feature Specification: Hard Risk Limits, Kill Switch, Dry-run Mode

**Feature directory**: `specs/021-risk-limits-kill-switch` | **Date**: 2026-11-20 | **Phase**: 3 of 6
**Status**: Implemented

## Summary

Phases 4–5 will add an autopilot that executes recommendations without a human. Before that exists, every execution —
manual or automatic — must pass through a code-enforced safety layer:

1. **Hard risk limits** applied by one pure function (`applyRiskLimits` in `src/lib/riskLimits.ts`) used by both the
   order preview and the Inngest execution engine, so what the user previews is exactly what the engine enforces.
2. **Loss stops** (daily / weekly) that block new executions and engage the trading pause automatically.
3. **A kill switch** (trading pause) that cancels every open Alpaca order, cancels in-flight executions and blocks new
   ones until explicitly resumed.
4. **Dry-run mode**, ON by default, in which the engine plans everything but submits nothing.

## User Stories

### US1 — Risk limits on every execution (P1)
Per-user limits stored in `portfolio_settings.risk_limits` (jsonb). Defaults (used whenever the column is missing,
null or partially filled):

| Limit | Default | Meaning |
|---|---|---|
| `max_turnover_pct` | 20 | Σ \|order $\| / portfolio value per execution |
| `max_position_pct` | 20 | No stock above this weight after the trades (buys trimmed) |
| `min_cash_buffer_pct` | 2 | Buys never spend cash below this share of the portfolio |
| `drift_threshold_pct` | 3 | Orders with \|current% − target%\| below this are dropped |
| `max_single_order_usd` | null (no cap) | Each order trimmed to this USD amount |
| `daily_loss_stop_pct` | 3 | equity vs `last_equity` (Alpaca `/v2/account`) |
| `weekly_loss_stop_pct` | 7 | equity vs first equity point of `/v2/account/portfolio/history?period=1W&timeframe=1D` |

Order of application (each step only ever shrinks or removes orders — **never increases**):
1. Forced Shariah SELLs (holdings that failed screening) are always allowed and exempt from every cap.
2. Drift filter.
3. Turnover cap — buys and non-forced sells are scaled down proportionally into the budget left after forced sells.
4. Position cap — buys trimmed so (current position value + buy) ≤ cap × portfolio value.
5. Cash buffer — buys scaled so cash + planned sell proceeds − buys ≥ buffer × portfolio value.
6. Single-order cap.

Blocked orders become `skipped` with a human-readable reason; trimmed orders stay `planned` and carry `risk_note`.
The result also contains `adjustments[]` and a `summary` (turnover before/after, counts, limits).

**Acceptance**: preview lists every trimmed / blocked order with its reason; the engine submits the same adjusted plan;
in the engine the cash buffer is applied again to real settled buying power after the sells have filled.

### US2 — Loss stops (P1)
- Daily: `(last_equity − equity) / last_equity × 100 > daily_loss_stop_pct` → blocked.
- Weekly: `(week_start − equity) / week_start × 100 > weekly_loss_stop_pct` → blocked (week_start = first positive
  equity point of the 1W/1D history).
- When a stop is breached the engine engages the trading pause automatically (reason recorded) and cancels the
  execution. When the account / history cannot be read the execution is cancelled ("could not verify") but the pause is
  not engaged (fail closed, no false pause).
- The engine re-checks the pause flag and loss stops immediately before submitting SELLs and again before BUYs.
- The preview shows the loss-stop state and disables Confirm when blocked.

### US3 — Kill switch (P1)
- `portfolio_settings.trading_paused`, `paused_reason`, `paused_at`.
- `POST /api/portfolio/trading/pause` (auth → 401, `premium_plus` → 403, Zod → 400, audit `trading_paused`): persists
  the pause, cancels **all** open orders on the Alpaca account (`DELETE /v2/orders`), marks every non-terminal
  execution of the user `cancelled` (unsubmitted orders → skipped). The engine checks the flag / row status between
  steps and stops; its writes are conditional so they cannot overwrite a `cancelled` row.
- `POST /api/portfolio/trading/resume` requires `{ confirm_text: "RESUME" }` (audit `trading_resumed`).
- `requestExecution()` (manual and future autopilot) refuses while paused → execute route returns **423**.
- Portfolio page shows a red banner with the reason while paused.

### US4 — Dry-run mode (P1)
- `portfolio_settings.dry_run` (default **true**). In dry run the engine runs the full planner (Shariah guard,
  settlement check, risk limits, loss stops) but submits nothing: every planned order is recorded `simulated` and the
  execution ends `dry_run_completed`. It does not wait for the market to open.
- A `dry_run_completed` row does not count as "already executed": a later request deletes it (conditionally) and
  inserts a new row, so the user can simulate first and then trade for real. The UNIQUE constraint guard is unchanged.
- UI labels DRY RUN on the portfolio page, preview modal and results panel. Turning dry run off requires typing
  `ENABLE LIVE TRADING` (also enforced by the settings API).

### US5 — Settings (P2)
- "Risk & safety" card on `/portfolio/settings`: the seven limits, dry-run toggle, pause / resume control.
- `PUT /api/portfolio/settings` accepts `risk_limits` (each 1–100 %, single-order cap 1–10,000,000 or null) and
  `dry_run` (+ `confirm_text` when turning it off). New columns are written in a separate best-effort update; when it
  fails the response carries `safety_settings_warning` and the UI shows it. Audit `risk_limits_updated`.

## Edge cases
- Migration not applied: limits = defaults, dry_run = **true** (no live orders until the migration is applied), pause
  cannot persist → pause still cancels open orders and in-flight executions, UI shows a warning.
- Portfolio value ≤ 0 → every non-forced order blocked.
- Sell with no price → cannot be resized → blocked when it needs trimming.
- Whole-share orders trim to whole shares; notional buys to cents; anything below Alpaca's $1 minimum is blocked.

## Decisions made autonomously
1. Forced Shariah sells count toward turnover (they consume the budget first) but are never trimmed or blocked;
   they are exempt from the single-order cap too (a non-compliant holding is always sold in full).
2. A forced sell = a SELL whose ticker is excluded / non-compliant in the stored screening, or whose action-list note
   starts with "Not Shariah-compliant".
3. Position cap and turnover use pre-trade account equity as the portfolio value (falls back to cash + positions).
4. Cash buffer in the plan counts expected proceeds of planned sells; the engine re-applies the buffer to real settled
   buying power (`min(settled capacity, cash − buffer)`) after sells fill.
5. Loss-stop verification failures cancel the execution but do not engage the pause; actual breaches do.
6. Dry-run executions skip the market wait (immediate feedback) and can be replaced by a later request.
7. Missing `dry_run` column ⇒ dry run ON. This means live trading stays off until the migration is applied — the
   conservative choice; existing users also get `dry_run = true` when the migration runs.
8. Pause cancels ALL open orders on the Alpaca account (as specified — it is a kill switch), not only app orders.
9. New execution statuses `cancelled`, `dry_run_completed` and order status `simulated` live in the existing jsonb
   envelope (no schema change).
10. Resume confirmation is the typed word `RESUME`; loss-stop pauses are never auto-resumed.
11. Loss stops and the pause block every order, including forced Shariah sells (no trading at all while halted);
    the sells run on the next execution after resume.
12. The engine checks the kill switch before every individual order submission and in the safety checks; polling
    is not interrupted because the pause route already cancels open orders at Alpaca.
13. Dry run applies the turnover / position / buffer limits against current cash plus expected sell proceeds; the
    simulated amounts may therefore differ slightly from a live run, where buys are re-sized to settled cash.
