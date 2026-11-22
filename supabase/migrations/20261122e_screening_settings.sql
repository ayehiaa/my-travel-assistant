-- specs/030-configurable-islamic-screening
-- 1. portfolio_settings.screening_settings (jsonb, nullable). NULL = everything ON (the spec-019 behaviour), so no
--    backfill is needed and existing users keep full Islamic screening. RLS: portfolio_settings policies already
--    restrict rows to their owner (user_id = auth.uid()); a new column needs no new policy.
-- 2. audit_log.action + screening_settings_updated (FULL list, drop and recreate).
-- Idempotent. If not applied: screening stays fully on and saving the settings returns a warning.

-- ── 1. Screening settings column ─────────────────────────────────────────────
alter table public.portfolio_settings
  add column if not exists screening_settings jsonb;

comment on column public.portfolio_settings.screening_settings is
  'Per-user screening settings (specs/030): {islamic_enabled, business_screen, financial_screen, stocks_only}. '
  'NULL or a missing key = ON (full Islamic screening + individual stocks only).';

-- Only an object (or NULL) is accepted; the app validates the keys with Zod.
alter table public.portfolio_settings drop constraint if exists portfolio_settings_screening_settings_check;
alter table public.portfolio_settings
  add constraint portfolio_settings_screening_settings_check
  check (screening_settings is null or jsonb_typeof(screening_settings) = 'object');

-- ── 2. audit_log.action: + screening_settings_updated (FULL list) ────────────
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
    'notification_test_sent',
    'ai_key_connected',
    'ai_key_disconnected',
    'user_plan_changed',
    'user_features_changed',
    'customer_invited',
    'customer_invitation_revoked',
    'health_consent_given',
    'health_programme_activated',
    'health_adjustment_accepted',
    'health_adjustment_declined',
    'health_programme_imported',
    'health_programme_updated',
    'health_data_exported',
    'health_data_deleted',
    'screening_settings_updated'
  )) not valid;
