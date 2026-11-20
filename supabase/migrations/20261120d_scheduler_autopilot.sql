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
    'autopilot_mode_changed'
  ));
