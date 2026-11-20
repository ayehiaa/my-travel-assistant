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
    'risk_limits_updated'
  ));
