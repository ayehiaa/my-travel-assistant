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
  ));
