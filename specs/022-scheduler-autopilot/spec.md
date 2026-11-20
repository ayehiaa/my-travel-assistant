# Feature Specification: Scheduled Runs + Autopilot

**Feature directory**: `specs/022-scheduler-autopilot` | **Date**: 2026-11-20 | **Phase**: 4 of 6
**Status**: Implemented

## Summary
Analysis runs can start on a schedule (NYSE trading days, 10:30 America/New_York — one hour after the open) and an
**Autopilot** setting decides what happens with the result: nothing automatic (`off`, the default), a 24-hour
approval request (`approval`), or an automatic execution request (`auto`). Every execution still goes through
`requestExecution()` (trading pause, dry run, risk limits, loss stops, Shariah buy guard).

## User Stories

### US1 — Scheduled runs (P1)
- Inngest cron `TZ=America/New_York 30 10 * * 1-5` (`src/inngest/scheduledRuns.ts`).
- Picks users with: `autopilot_mode != 'off'`, run due (`next_run_at` null or ≤ now + 30 min tolerance),
  role `premium_plus`, Alpaca connected. Fans out one event per user (event id `scheduled-run-<user>-<date>`).
- Per user: re-checks all of the above, confirms today is a trading day via Alpaca `/v2/calendar?start=D&end=D`
  with the user's own credentials (holiday or calendar failure → skip, stays due), then starts the run with
  `startAnalysisRun()` — the same function `POST /api/portfolio/run` uses (credentials, live value, cooldown,
  recommendations row, run_progress rows, last_run_at, event).
- Scheduled runs bypass the 24 h manual cooldown only when the last run is more than 20 h old.
- After starting: `next_run_at = computeNextRunAt(now, interval)`.
- Interval options: Daily (1), Weekly (7), Fortnightly (14), Monthly (30).

**Acceptance**: mode `off` → no scheduled runs; a holiday → no run, run happens on the next trading day; two fires
for the same user and date → one run; a daily schedule runs every trading day.

### US2 — Autopilot mode (P1)
`portfolio_settings.autopilot_mode`: `off` (default; missing column → off) | `approval` | `auto`.
- **approval**: when a scheduled run completes the recommendation gets `approval_status = 'pending'`,
  `approval_expires_at = completed + 24 h`. The recommendation page shows "Approve & execute" / "Reject" with a
  countdown and what will happen (dry run vs live, paper vs live account). Approve re-checks on the server: still
  pending and not expired, still the latest complete recommendation, no existing execution, trading not paused, then
  calls `requestExecution()`. Reject → `rejected`. Expired is computed on read (no cron).
- **auto**: `portfolio/run.completed` with `trigger: 'schedule'` → `src/inngest/autopilotExecute.ts` calls
  `requestExecution()` if the run completed in auto mode AND the mode is still auto, the recommendation is the latest,
  not executed, user still premium_plus. Never for manual runs. With dry run ON (the default) the execution is
  simulated — the intended way to trial autopilot.
- Switching to `auto` requires the typed confirmation `ENABLE AUTOPILOT` (UI and API); approval/off do not.

### US3 — API (P1)
- `POST /api/portfolio/recommendations/[id]/approve` and `/reject`: auth → 401, premium_plus → 403, Zod id → 400,
  ownership → 404, state machine → 409 (not scheduled / not pending / expired / not latest / already executed),
  423 (paused). Audit `recommendation_approved` / `recommendation_rejected`.
- Settings PUT: `autopilot_mode` (+ `autopilot_confirm_text`), `run_interval_days` 1. Audit `autopilot_mode_changed`.

### US4 — UI (P2)
- Settings: "Autopilot" card — mode radios, "Trading days at 10:30 New York time (15:30 UK)", interval, next run.
- Portfolio page: Autopilot status line (mode, next run) + "Pending approval — expires in Xh" card.
- Recommendation page: approval panel.

## Decisions made autonomously
1. **Interval → trading days**: Daily = 1, Weekly = 5, Fortnightly = 10, Monthly = 21 trading days.
   `next_run_at` = New York date of the run + N weekdays at 10:30 ET (= "next trading day + (N − 1) trading days").
   Holidays are not modelled in the maths; a run landing on one is skipped by the calendar check and happens on the
   next trading day (it stays due).
2. **Due tolerance** of 30 min so a cron firing marginally early still counts.
3. **Interval moved** from the main settings form into the Autopilot card (one place to edit the schedule).
4. **Changing mode/interval re-plans** `next_run_at` from `last_run_at` (null when never run → due at the next slot).
5. **Mode read at completion**: approval/auto behaviour uses the mode when the scheduled run completes; auto also
   requires the mode to still be `auto` at execution time. A mode switched to off mid-run means no approval request.
6. **Approval stored twice**: dedicated columns (migration) and `agent_outputs.autopilot` (pre-migration fallback),
   written in one update so they cannot disagree; the fallback update is used when the columns are missing.
7. **Approve records `approved` after** `requestExecution()` succeeds (the execution row's UNIQUE constraint is the
   double-execution guard); a failed request leaves it pending.
8. **Reject is allowed** even if a newer recommendation exists or trading is paused; approve is not.
9. **Expired / rejected** recommendations can still be executed manually with the existing Execute button — that is
   an explicit user action and goes through all the same guards.
10. **Inngest**: `portfolio-analysis` gained idempotency per run and concurrency 1 per user; the scheduler cron has
    global concurrency 1; per-user scheduled runs are idempotent per user + date with concurrency 1 per user;
    auto-execution is idempotent per run with concurrency 1 per user.
11. Calendar check failure **fails closed** (no run that day; stays due).
12. Scheduled runs are audited as `run_triggered` and auto-executions as `alpaca_executed`, attributed to the user.

## Out of scope
Notifications (email/push) for pending approvals; hub layout (phase 6).
