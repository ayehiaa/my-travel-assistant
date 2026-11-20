# Implementation Plan: 023 Trading Notifications

## Technical context
Next.js 16 App Router, Supabase (admin client in Inngest), Inngest v4 (events, cron with TZ, sleepUntil,
idempotency, retries), Resend REST API via fetch, Zod 4, Vitest, Tailwind.

## Constitution check
- Auth first, premium_plus, Zod at boundaries, `logAudit` on writes (prefs update, test email).
- Pure logic tested next to files (`src/lib/notifications/*.test.ts`).
- No trading guard touched: notifications only read state; emit calls are wrapped so they can never fail a run,
  approval, pause/resume or execution.
- Works without the migration: prefs default, log writes skipped, test-email rate limit falls back to in-memory.

## Design
### Pure (`src/lib/notifications/`)
- `types.ts` — `NOTIFICATION_TYPES`, payload types per type, `NotificationEventData`.
- `prefs.ts` — `DEFAULT_NOTIFICATION_PREFS`, `readNotificationPrefs(row)`, `isNotificationEnabled`,
  `mergeNotificationPrefs`, `testEmailCooldownRemainingMs`.
- `format.ts` — `formatUsd`, `formatNyUk(iso)` ("Sat 21 Nov 2026, 10:30 New York / 15:30 UK"), `escapeHtml`.
- `templates.ts` — `buildNotificationEmail(type, payload, { baseUrl })` → `{ subject, text, html }`.
- `divest.ts` — `detectDivestments(previous, current, actionList)`.
- `idempotency.ts` — `notificationIdempotencyKey(type, entityId)`, `notificationEventId`.
- `weekly.ts` — `computeWeeklyChange(equity[])`, `topTrades(actionList, n)`, `executionNotificationType(status)`.
- `config.ts` — `readEmailConfig(env)`.

### Server I/O
- `src/lib/notifications/send.ts` — `sendNotification(userId, type, payload, { entityId, force })`: config → prefs →
  durable dedupe → recipient → template → Resend POST (Idempotency-Key) → log. Throws only on retriable Resend
  errors (429/5xx/network) so Inngest retries; everything else returns `{ sent: false, reason }`.
- `src/lib/notifications/emit.ts` — `emitNotification(...)` (inngest.send, never throws) and `notificationEvent()`
  for `step.sendEvent`.
- `src/lib/notifications/log.ts` — best-effort log insert + "already sent" lookup.

### Inngest (`src/inngest/notifications.ts`)
- `deliverNotification` (`notifications/send`, retries 4, idempotency on key, onFailure logs `failed`).
- `notifyRunCompleted` (`portfolio/run.completed`): run_completed, approval_needed + `portfolio/approval.pending`,
  shariah_status_change.
- `approvalExpiryWatch` (`portfolio/approval.pending`): sleepUntil → still pending → approval_expired.
- `notifyExecutionCompleted` (`portfolio/execution.completed`).
- `weeklySummaryCron` + `weeklySummaryUser`.
- Emit points: pause/resume routes, executeTrades halt (loss stop) / give-up / onFailure.

### Migration `20261120e_trading_notifications.sql`
`portfolio_settings.notification_prefs jsonb`, `notification_log` (+ RLS owner select, index), audit constraint full
list + `notification_test_sent`.

### UI
`NotificationsCard` on Portfolio Settings; audit pill for `notification_test_sent`.
