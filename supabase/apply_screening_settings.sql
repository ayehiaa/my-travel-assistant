-- =====================================================================================
-- Sojourn — Configurable Islamic screening (combined, run once)
-- Paste this whole script into Supabase → SQL Editor → New query → Run.
--
-- Contains:
--   20261122e_screening_settings.sql   (specs/030-configurable-islamic-screening)
--     * portfolio_settings.screening_settings jsonb (NULL = everything ON — existing users keep full screening)
--     * audit_log.action + screening_settings_updated (full list)
--
-- Requires: supabase/apply_all_pending_2026-11-22.sql (or all of its individual scripts) — checked below.
-- Safe to re-run: every change is IF NOT EXISTS / drop-and-recreate.
-- Runs in ONE transaction: if any statement fails, nothing is changed.
-- =====================================================================================

begin;

-- 0. Pre-checks: stop with a clear message if the earlier combined script was never applied.
do $$
begin
  if to_regclass('public.portfolio_settings') is null or to_regclass('public.audit_log') is null then
    raise exception 'Missing portfolio_settings / audit_log — apply the earlier portfolio migrations first';
  end if;
  if to_regclass('public.health_programme_imports') is null
     or to_regclass('public.health_meal_plans') is null then
    raise exception 'apply_all_pending_2026-11-22.sql not applied yet — run supabase/apply_all_pending_2026-11-22.sql first';
  end if;
end $$;

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

commit;

-- Verify (optional) — expect one row for the column and true for the audit action.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'portfolio_settings' and column_name = 'screening_settings';

select pg_get_constraintdef(oid) like '%screening_settings_updated%' as audit_action_allowed
from pg_constraint where conname = 'audit_log_action_check';
