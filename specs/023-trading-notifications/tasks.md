# Tasks: 023 Trading Notifications

## Foundation
- [x] T1 Migration `20261120e_trading_notifications.sql` (notification_prefs jsonb, notification_log + RLS, audit list + `notification_test_sent`)
- [x] T2 Types: `AuditAction` (+1), notification types/payloads (`src/lib/notifications/types.ts`)

## Pure logic (tested)
- [x] T3 `prefs.ts` + tests (defaults, parse, merge, enabled check, test-email cooldown)
- [x] T4 `format.ts` + tests (New York / UK time incl. DST gaps, USD, %)
- [x] T5 `templates.ts` + tests (every event type + test email; escaping)
- [x] T6 `divest.ts` + tests (compare previous vs current screening)
- [x] T7 `idempotency.ts`, `config.ts` + tests
- [x] T8 `summary.ts` + tests (top trades, execution → type, order outcomes, weekly change, Shariah status, redaction)

## Server
- [x] T9 `send.ts` (Resend REST + Idempotency-Key, prefs, durable dedupe, recipient via auth admin), `log.ts`, `emit.ts`
- [x] T10 Inngest `deliverNotification` (retries, idempotency, onFailure log)
- [x] T11 Inngest `notifyRunCompleted` (run_completed, approval_needed, shariah_status_change, approval.pending)
- [x] T12 Inngest `approvalExpiryWatch` (sleepUntil → still pending → approval_expired)
- [x] T13 Inngest `notifyExecutionCompleted`; engine emits on give-up and onFailure
- [x] T14 trading_paused (pause route + loss stop in engine), trading_resumed (resume route)
- [x] T15 Inngest `weeklySummaryCron` (Fri 17:00 ET) + `weeklySummaryUser`
- [x] T16 Register functions in `/api/inngest`

## API
- [x] T17 `GET/PUT /api/portfolio/notifications`
- [x] T18 `POST /api/portfolio/notifications/test` (rate limit 1/min, audit `notification_test_sent`)

## UI
- [x] T19 `NotificationsCard` on Portfolio Settings; audit pill

## Quality gate
- [x] Q1 `npm run build`, `npm test`, `npm run lint`; no console.log
