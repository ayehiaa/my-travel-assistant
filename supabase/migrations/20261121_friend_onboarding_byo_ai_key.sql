-- specs/026-friend-onboarding-byo-ai-key: invitation roles + bring-your-own Anthropic API key.
-- Idempotent. The app keeps working without this migration:
--   * invitations can still be created as 'main' (other roles are refused with an "apply the migration" message);
--     signup inserts 'main';
--   * the Claude API key card shows "Database update needed" and analysis runs only resolve a key for the owner
--     emails in ANTHROPIC_KEY_OWNER_EMAILS (app key) — everyone else is refused before the run starts;
--   * ai_key_connected / ai_key_disconnected audit rows would be rejected (best-effort, never fails a request).

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
