-- =====================================================================================
-- Sojourn — friend onboarding + bring-your-own Anthropic API key (combined, run once)
-- Paste this whole script into Supabase → SQL Editor → New query → Run.
--
-- Contains:
--   20261121_friend_onboarding_byo_ai_key.sql   (specs/026-friend-onboarding-byo-ai-key)
--     * customer_invitations.role  (main | premium | premium_plus, default 'main')
--     * user_ai_credentials table   (encrypted Anthropic API keys; RLS on, no client policies)
--     * audit_log.action CHECK      (+ ai_key_connected, ai_key_disconnected — full list)
--
-- Safe to re-run: every change is IF NOT EXISTS / drop-and-recreate.
-- Runs in ONE transaction: if any statement fails, nothing is changed.
-- =====================================================================================

begin;

-- 0. Pre-checks: stop with a clear message if earlier migrations were never applied.
do $$
begin
  if to_regclass('public.customer_invitations') is null then
    raise exception 'Missing table public.customer_invitations — apply 008_customer_invitations.sql first';
  end if;
  if to_regclass('public.audit_log') is null then
    raise exception 'Missing table public.audit_log';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'portfolio_settings' and column_name = 'notification_prefs'
  ) then
    raise exception 'Trading features not applied yet — run supabase/apply_trading_features_2026-11-20.sql first';
  end if;
end $$;

-- ── customer_invitations.role ─────────────────────────────────────────────────
-- The role the invited account gets at signup. Existing rows become 'main' (what signup always inserted before).
alter table public.customer_invitations add column if not exists role text not null default 'main';
alter table public.customer_invitations drop constraint if exists customer_invitations_role_check;
alter table public.customer_invitations
  add constraint customer_invitations_role_check check (role in ('main', 'premium', 'premium_plus'));

-- ── user_ai_credentials ───────────────────────────────────────────────────────
-- Each Portfolio user's own Anthropic API key, AES-256-GCM encrypted by the app (ALPACA_CREDENTIAL_ENCRYPTION_KEY).
-- RLS is ON with NO client policies: browsers can neither read nor write this table; the app reads/writes it only
-- with the service role in API routes and background jobs, and never returns the key (only key_last4).
create table if not exists public.user_ai_credentials (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  encrypted_api_key text not null,
  key_iv            text not null,
  key_last4         text not null,
  provider          text not null default 'anthropic',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.user_ai_credentials drop constraint if exists user_ai_credentials_provider_check;
alter table public.user_ai_credentials
  add constraint user_ai_credentials_provider_check check (provider in ('anthropic'));

alter table public.user_ai_credentials enable row level security;

-- ── audit_log.action: + ai_key_connected, ai_key_disconnected (full list) ──────
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
    'ai_key_disconnected'
  )) not valid;

commit;

-- Verify (optional): should return 3 rows, and rls_enabled = true for user_ai_credentials.
select 'customer_invitations.role' as item, data_type as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'customer_invitations' and column_name = 'role'
union all
select 'user_ai_credentials', case when c.relrowsecurity then 'rls_enabled = true' else 'rls_enabled = FALSE' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'user_ai_credentials'
union all
select 'audit_log_action_check', case when pg_get_constraintdef(oid) like '%ai_key_disconnected%' then 'includes ai_key_*' else 'MISSING ai_key_*' end
from pg_constraint where conname = 'audit_log_action_check';
