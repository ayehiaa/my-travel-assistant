# Tasks: 022 Scheduled Runs + Autopilot

## Foundation
- [x] T1 Migration `20261120d_scheduler_autopilot.sql` (interval CHECK, autopilot_mode, approval columns, audit list)
- [x] T2 Types: `AuditAction` (+3), `run_interval_days` 1, optional autopilot columns

## Pure logic (tested)
- [x] T3 `src/lib/schedule.ts` + tests (ET time, weekdays, next run, due, cooldown, calendar)
- [x] T4 `src/lib/autopilot.ts` + tests (info read/write, expiry, approval state machine, auto decision)

## Server
- [x] T5 `startAnalysisRun()` extracted; run route uses it
- [x] T6 `fetchMarketCalendar` in alpacaClient
- [x] T7 `autopilotStore.ts` (best-effort column write + agent_outputs fallback)
- [x] T8 Inngest `scheduledRunsCron` + `scheduledUserRun` (idempotent per user/date, concurrency per user)
- [x] T9 `portfolioAnalysis`: trigger in event, mark-autopilot step, idempotency + concurrency
- [x] T10 Inngest `autopilotExecute` (auto mode via requestExecution)
- [x] T11 Register functions in `/api/inngest`

## API
- [x] T12 `POST /api/portfolio/recommendations/[id]/approve` and `/reject`
- [x] T13 Settings PUT: autopilot_mode + confirm, run_interval_days 1 (best-effort + warning), next_run_at re-plan

## UI
- [x] T14 `AutopilotCard` on settings (interval moved out of the main form)
- [x] T15 `AutopilotStatus` on portfolio page (status line + pending approval card)
- [x] T16 `ApprovalPanel` on recommendation page; audit pills for new actions

## Quality gate
- [x] Q1 `npm run build`, `npm test`, `npm run lint`; no console.log
