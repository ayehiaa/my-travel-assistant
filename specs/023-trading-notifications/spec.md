# Feature Specification: Trading Notifications (email)

**Feature directory**: `specs/023-trading-notifications` | **Date**: 2026-11-20 | **Phase**: 5 of 6
**Status**: Implemented | Closes GitHub issue #84 "[Portfolio] Email notifications for scheduled runs (Resend)"

## Summary
The autonomous trading system (scheduled runs, approval mode, automatic execution, kill switch, loss stops, Shariah
screening) now tells the user what happened by email, via the Resend REST API. Every email is triggered by an Inngest
event and delivered by ONE notification function with retries and an idempotency key per (event type, entity id), so a
notification can never fail a run or an execution and is never sent twice. Users control notifications from a
"Notifications" card in Portfolio Settings (master switch + per-type toggles + "Send test email").

## User Stories

### US1 — Run and approval emails (P1)
- **run_completed** (manual or scheduled): summary (truncated), trigger, portfolio value, top 5 trades by size, link.
- **approval_needed** (scheduled run in approval mode): expiry time in New York AND UK time, link to approve.
- **approval_expired**: sent once when the 24 h window closes and the stored status is still `pending` (Inngest
  `step.sleepUntil(expires_at)` in a function triggered by `portfolio/approval.pending`).
- **shariah_status_change** ("Divest"): a CURRENT holding (is_holding) screened non-compliant in this run that was
  compliant in the previous complete recommendation's stored screening. Lists ticker, reasons and whether the
  recommendation includes a SELL for it.

**Acceptance**: a completed run sends exactly one run email; approval mode adds an approval email; an approval left
untouched for 24 h sends one expiry email; approving/rejecting before expiry sends none.

### US2 — Execution emails (P1)
`portfolio/execution.completed` → per-order outcome table (ticker, side, amount, status, fill price, note):
- `completed` → **execution_completed**; `completed_with_errors` → **execution_completed_with_errors**;
  `failed` / `cancelled` → **execution_failed** (with the error / cancel reason); `dry_run_completed` → **dry_run_completed**.
- The engine now also emits `portfolio/execution.completed` when it gives up waiting for the market and from its
  `onFailure` handler (best-effort) so failures are notified too.

### US3 — Safety emails (P1)
- **trading_paused**: manual kill switch (pause route) or automatic loss stop (execution engine halt with
  engagePause) — includes the reason. **trading_resumed**: resume route.

### US4 — Weekly summary (P2)
Inngest cron `TZ=America/New_York 0 17 * * 5` (Friday 17:00 ET, after the close). Users with Alpaca connected,
role premium_plus and the weekly summary enabled. Contents: week's runs, executions, P&L from Alpaca portfolio
history (period 1W, timeframe 1D: last − first equity), current Shariah status of holdings from the latest complete
recommendation.

### US5 — Preferences + test email (P1)
- `portfolio_settings.notification_prefs` jsonb `{ enabled, types: { <type>: boolean }, last_test_sent_at }`.
  Missing column / null / unknown keys → defaults: **master on, every type on (weekly_summary included)**.
- `GET/PUT /api/portfolio/notifications` (auth → 401, premium_plus → 403, Zod → 400; audit
  `portfolio_settings_updated`; best-effort write with a migration warning).
- `POST /api/portfolio/notifications/test`: auth, premium_plus, rate limited to 1/minute (in-memory guard + 
  `last_test_sent_at` in prefs), sends a test email synchronously, audit `notification_test_sent`.
- Settings "Notifications" card (Tailwind) with toggles, save, test button.

### US6 — Delivery log (P2)
`notification_log` (id, user_id, type, entity_id, status sent|failed|skipped, error, created_at; RLS owner read).
Best-effort insert; table missing → skipped silently. Phase 6's Activity tab will read it.

## Requirements
- Env: `RESEND_API_KEY`, `NOTIFICATIONS_FROM_EMAIL` (fallback `RESEND_FROM_EMAIL`), `APP_BASE_URL` (fallback
  `NEXT_PUBLIC_APP_URL`, then `http://localhost:3000`). Missing key or sender → silent no-op `{ sent: false, reason }`.
- Recipient = the user's auth email (`auth.admin.getUserById`). No API keys or account numbers in emails; error
  strings are redacted of the Resend key and truncated.
- Pure, unit-tested template builders produce subject + plain text + simple inline-styled HTML; all user/AI text is
  HTML-escaped.

## Decisions made autonomously
1. **Fetch, not the SDK**: the `resend` package is already a dependency (invitation emails), but fetch makes the
   `Idempotency-Key` header explicit and keeps the sender trivially testable. No new dependency.
2. **Three dedupe layers**: Inngest event `id` = `notif-<type>-<entity>` (24 h dedupe), function idempotency on
   `event.data.idempotency_key`, Resend `Idempotency-Key` header, plus a durable check of `notification_log` for an
   earlier `sent` row with the same (user, type, entity) when the table exists.
3. **Defaults all on** (including weekly summary) — emails are informational, not trading actions; nothing is sent at
   all until `RESEND_API_KEY` and a sender are configured.
4. **cancelled executions** use the execution_failed toggle/template variant ("Execution cancelled").
5. **approval_expired** does not write `approval_status = 'expired'` (expiry stays computed on read, as in phase 4);
   it is skipped when the recommendation was approved/rejected or an execution exists.
6. **Divest detection** requires the ticker to be in BOTH screenings: holdings first screened in this run, or a
   previous recommendation without stored screening, never trigger it (no false "status change").
7. **Test email** bypasses the master switch (explicit user action) but not the env configuration; the rate limit
   uses an in-memory map plus `last_test_sent_at` (works across instances once the migration is applied).
8. **Run failures** (status `error`) are not emailed in this phase (not in the issue); listed as a follow-up.
9. Weekly summary entity id = `<user>-<NY date>` so a re-fired cron never sends a second summary for the same week.
10. P&L shown is the change in account equity over the 1W history (includes deposits/withdrawals) — labelled "change
    in account value".

## Out of scope
Push/SMS, per-user schedule for the summary, run-error emails, Activity tab UI (phase 6).
