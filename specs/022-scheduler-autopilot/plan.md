# Implementation Plan: 022 Scheduled Runs + Autopilot

## Technical context
Next.js 16 App Router, Supabase, Inngest v4 (cron with TZ, idempotency, concurrency), Alpaca REST, Zod 4, Vitest,
Tailwind.

## Constitution check
- Auth first, `premium_plus`, Zod at every boundary, `logAudit` on every write — approve/reject/settings.
- Pure logic tested next to files: `schedule.test.ts`, `autopilot.test.ts`.
- No guard weakened: all executions via `requestExecution()` (pause, dry run, loss stops, risk limits, Shariah guard in
  the engine), 409 on re-execution (UNIQUE), ownership checks, premium_plus re-checked in background functions.
- Autonomous behaviour is OFF by default (`autopilot_mode` default 'off'; missing column → 'off').

## Design
### Pure
- `src/lib/schedule.ts`: intervals, modes, `readAutopilotSettings`, New York time (`nyParts`, `nyWallTimeToUtc`,
  `nyOffsetMinutes`), `addWeekdays`, `computeNextRunAt`, `nextScheduleSlot`, `isDue`, `isScheduledRunDue`,
  `cooldownRemainingSeconds`, `isTradingDayFromCalendar`, `formatRunTime`.
- `src/lib/autopilot.ts`: `AutopilotInfo`, `readAutopilotInfo`, `buildScheduledRunInfo`, `effectiveApprovalStatus`,
  `msUntilExpiry`, `checkApprovalDecision` (state machine), `applyApprovalDecision`, `shouldAutoExecute`,
  `isAwaitingApproval`, `autopilotColumns`, `formatDuration`.

### Server I/O
- `src/lib/startAnalysisRun.ts` — extracted from the run route; used by the route and the scheduler.
- `src/lib/autopilotStore.ts` — `saveAutopilotInfo` (columns + agent_outputs in one update, fallback without
  columns), `latestCompleteRecommendationId`.
- `src/lib/approvalDecisionRoute.ts` — shared approve/reject handler.
- `src/lib/alpacaClient.ts` — `fetchMarketCalendar`.

### Inngest
- `scheduledRuns.ts`: `scheduledRunsCron` (cron, fan-out) + `scheduledUserRun` (per user).
- `portfolioAnalysis.ts`: event `trigger`, `mark-autopilot` step for scheduled runs, `run.completed` carries trigger.
- `autopilotExecute.ts`: auto mode.

### Migration `20261120d_scheduler_autopilot.sql`
Relax `run_interval_days` CHECK to (1,7,14,30); `autopilot_mode`; recommendations `run_trigger`, `approval_status`,
`approval_expires_at`, `approval_decided_at`; audit constraint full list (+3).

### UI
`AutopilotCard` (settings), `AutopilotStatus` (portfolio), `ApprovalPanel` (recommendation), audit pills.
