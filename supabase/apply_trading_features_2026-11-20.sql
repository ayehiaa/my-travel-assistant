-- =====================================================================================
-- Sojourn — trading features database update (combined, run once)
-- Paste this whole script into Supabase → SQL Editor → New query → Run.
--
-- Combines, in order:
--   20261120_shariah_screening.sql          (phase 1)
--   20261120b_audit_log_action_extend_all.sql
--   20261120c_risk_limits_kill_switch.sql   (phase 3)
--   20261120d_scheduler_autopilot.sql       (phase 4)
--   20261120e_trading_notifications.sql     (phase 5)
--
-- Safe to re-run: every change is IF NOT EXISTS / drop-and-recreate.
-- Runs in ONE transaction: if any statement fails, nothing is changed.
-- =====================================================================================

begin;

-- 0. Pre-checks: stop with a clear message if earlier migrations were never applied.
do $$
begin
  if to_regclass('public.recommendations') is null then
    raise exception 'Missing table public.recommendations — apply 018_run_progress_recommendations.sql first';
  end if;
  if to_regclass('public.portfolio_settings') is null then
    raise exception 'Missing table public.portfolio_settings — apply 015_portfolio_holdings_settings.sql first';
  end if;
  if to_regclass('public.alpaca_executions') is null or to_regclass('public.alpaca_credentials') is null then
    raise exception 'Missing Alpaca tables — apply 20260619_alpaca_trade_execution.sql first';
  end if;
  if to_regclass('public.audit_log') is null then
    raise exception 'Missing table public.audit_log';
  end if;
end $$;

-- 1. Phase 1 — Shariah screening -------------------------------------------------------
-- 20261120_shariah_screening.sql
-- Stores the full Shariah screening result (per-ticker verdict, reasons, ratios, source,
-- excluded flag, screened_at) on each recommendation.
-- Safe to apply at any time: the app writes this column in a separate best-effort update and
-- falls back to agent_outputs.shariah_review when the column is absent or empty.
-- RLS: recommendations already has row-level policies scoped to user_id; a new column inherits them.

ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS shariah_screening jsonb NULL;

COMMENT ON COLUMN public.recommendations.shariah_screening IS
  'Shariah screening result (version 1): per-ticker verdicts, AAOIFI ratios with source, excluded tickers. See specs/019-shariah-screening.';

-- 2. Phase 3 — risk limits, kill switch, dry run (dry run defaults to ON) --------------
-- Phase 3 (specs/021-risk-limits-kill-switch): hard risk limits, kill switch (trading pause) and dry-run mode.
-- Idempotent. The app keeps working without this migration: limits fall back to defaults, dry run is treated as ON
-- (no live orders) and the pause cannot persist (the UI shows a warning).
-- Existing portfolio_settings RLS policies (owner-only) cover the new columns.

alter table public.portfolio_settings add column if not exists risk_limits    jsonb;
alter table public.portfolio_settings add column if not exists trading_paused boolean not null default false;
alter table public.portfolio_settings add column if not exists paused_reason  text;
alter table public.portfolio_settings add column if not exists paused_at      timestamptz;
alter table public.portfolio_settings add column if not exists dry_run        boolean not null default true;

-- Extend audit_log.action CHECK with trading_paused, trading_resumed, risk_limits_updated (full list).

-- 3. Phase 4 — scheduler + Autopilot (Autopilot defaults to OFF) -----------------------
-- Phase 4 (specs/022-scheduler-autopilot): scheduled analysis runs + Autopilot.
-- Idempotent. The app keeps working without this migration: autopilot_mode reads as 'off' (no scheduled runs, no
-- automatic execution), the daily interval cannot be saved (the UI shows a warning) and approval data is kept in
-- recommendations.agent_outputs.autopilot instead of the dedicated columns.
-- Existing RLS policies cover the new columns (portfolio_settings: owner-only; recommendations: owner select, writes
-- via the service role).

-- ── portfolio_settings ─────────────────────────────────────────────────────────
-- Allow the daily interval (1). The original inline CHECK from 015 is named portfolio_settings_run_interval_days_check.
alter table public.portfolio_settings drop constraint if exists portfolio_settings_run_interval_days_check;
alter table public.portfolio_settings
  add constraint portfolio_settings_run_interval_days_check check (run_interval_days in (1, 7, 14, 30));

alter table public.portfolio_settings add column if not exists autopilot_mode text not null default 'off';
alter table public.portfolio_settings drop constraint if exists portfolio_settings_autopilot_mode_check;
alter table public.portfolio_settings
  add constraint portfolio_settings_autopilot_mode_check check (autopilot_mode in ('off', 'approval', 'auto'));

create index if not exists portfolio_settings_next_run_at on public.portfolio_settings (next_run_at);

-- ── recommendations ────────────────────────────────────────────────────────────
alter table public.recommendations add column if not exists run_trigger         text;
alter table public.recommendations add column if not exists approval_status     text;
alter table public.recommendations add column if not exists approval_expires_at timestamptz;
alter table public.recommendations add column if not exists approval_decided_at timestamptz;

alter table public.recommendations drop constraint if exists recommendations_run_trigger_check;
alter table public.recommendations
  add constraint recommendations_run_trigger_check check (run_trigger is null or run_trigger in ('manual', 'schedule'));

alter table public.recommendations drop constraint if exists recommendations_approval_status_check;
alter table public.recommendations
  add constraint recommendations_approval_status_check
  check (approval_status is null or approval_status in ('pending', 'approved', 'rejected', 'expired'));

-- ── audit_log.action: + recommendation_approved, recommendation_rejected, autopilot_mode_changed (full list) ──

-- 4. Phase 5 — notifications ----------------------------------------------------------
-- Phase 5 (specs/023-trading-notifications): email notifications.
-- Idempotent. The app keeps working without this migration: notification preferences read as the defaults (master
-- switch on, every type on), saving preferences returns a warning, the delivery log is skipped and the test-email
-- rate limit uses an in-memory guard only.

-- ── portfolio_settings.notification_prefs ─────────────────────────────────────
-- Shape: { "enabled": bool, "types": { "<type>": bool, ... }, "last_test_sent_at": iso string | null }
-- NULL or missing keys → defaults (everything enabled). Covered by the existing owner-only RLS policies.
alter table public.portfolio_settings add column if not exists notification_prefs jsonb;

-- ── notification_log ──────────────────────────────────────────────────────────
-- Best-effort delivery log written by the service role; read by the owner (phase 6 Activity tab).
create table if not exists public.notification_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null,
  entity_id  text not null,
  status     text not null check (status in ('sent', 'failed', 'skipped')),
  error      text,
  created_at timestamptz not null default now()
);

create index if not exists notification_log_user_created on public.notification_log (user_id, created_at desc);
create index if not exists notification_log_dedupe on public.notification_log (user_id, type, entity_id, status);

alter table public.notification_log enable row level security;

drop policy if exists "Users read own notification log" on public.notification_log;
create policy "Users read own notification log"
  on public.notification_log for select
  using (user_id = auth.uid());

-- ── audit_log.action: + notification_test_sent (full list) ────────────────────

-- 5. Audit log: allow every action the app writes (final list).
--    NOT VALID = applies to new rows only, so any unusual historic row can't block this script.
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log
  add constraint audit_log_action_check check (action in (
    'created',
    'updated',
    'deleted',
    'assistant_invited',
    'assistant_deactivated',
    'assistant_unlinked',
    'expense_created',
    'expense_updated',
    'expense_deleted',
    'expense_reclaimed',
    'expense_unreclaimed',
    'holding_created',
    'holding_updated',
    'holding_deleted',
    'portfolio_settings_updated',
    'run_triggered',
    'alpaca_credentials_connected',
    'alpaca_credentials_disconnected',
    'alpaca_executed',
    'alpaca_synced',
    'alpaca_safeguards_applied',
    'trading_paused',
    'trading_resumed',
    'risk_limits_updated',
    'recommendation_approved',
    'recommendation_rejected',
    'autopilot_mode_changed',
    'notification_test_sent'
  )) not valid;

commit;

-- 6. Verify (optional): should return 10 rows.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('recommendations','shariah_screening'), ('recommendations','run_trigger'),
    ('recommendations','approval_status'),   ('recommendations','approval_expires_at'),
    ('portfolio_settings','risk_limits'),    ('portfolio_settings','trading_paused'),
    ('portfolio_settings','dry_run'),        ('portfolio_settings','autopilot_mode'),
    ('portfolio_settings','notification_prefs'), ('notification_log','id'))
order by 1, 2;
