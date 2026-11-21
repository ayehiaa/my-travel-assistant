-- =====================================================================================
-- Sojourn — plans, add-ons and admin (combined, run once)
-- Paste this whole script into Supabase → SQL Editor → New query → Run.
--
-- Contains:
--   20261121b_plans_addons_admin.sql   (specs/027-plans-addons-admin)
--     * user_roles.account_type / plan / features  (+ CHECKs, backfill from the legacy role)
--     * RLS hardening: no client writes to user_roles or customer_invitations; delete_user() not callable by users
--     * customer_invitations.plan / features       (+ CHECKs, backfill from the 026 role column)
--     * audit_log.action CHECK (+ user_plan_changed, user_features_changed, customer_invited,
--       customer_invitation_revoked — full list)
--
-- Safe to re-run: every change is IF NOT EXISTS / drop-and-recreate; the backfill only touches rows still at the
-- column defaults. Runs in ONE transaction: if any statement fails, nothing is changed.
-- After applying: set APP_ADMIN_EMAILS (comma-separated) in the app's environment — admin is never stored here.
-- =====================================================================================

begin;

-- 0. Pre-checks: stop with a clear message if earlier migrations were never applied.
do $$
begin
  if to_regclass('public.user_roles') is null then
    raise exception 'Missing table public.user_roles';
  end if;
  if to_regclass('public.audit_log') is null then
    raise exception 'Missing table public.audit_log';
  end if;
  if to_regclass('public.customer_invitations') is null then
    raise exception 'Missing table public.customer_invitations — apply 008_customer_invitations.sql first';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_invitations' and column_name = 'role'
  ) or to_regclass('public.user_ai_credentials') is null then
    raise exception 'Friend onboarding not applied yet — run supabase/apply_friend_onboarding_2026-11-21.sql first';
  end if;
  if exists (
    select 1 from public.user_roles where role not in ('main', 'assistant', 'premium', 'premium_plus')
  ) then
    raise exception 'user_roles has unexpected role values — fix them before running this script';
  end if;
end $$;

-- ── 1. user_roles: account_type / plan / features ─────────────────────────────
-- `role` is LEGACY from here on: the app still writes it (kept in sync, see src/lib/access.ts legacyRoleFor) but
-- reads ONLY these columns once they exist. Free + Portfolio has no legacy role and is written as role 'main'.
alter table public.user_roles add column if not exists account_type text   not null default 'member';
alter table public.user_roles add column if not exists plan         text   not null default 'free';
alter table public.user_roles add column if not exists features     text[] not null default '{}';

alter table public.user_roles drop constraint if exists user_roles_account_type_check;
alter table public.user_roles
  add constraint user_roles_account_type_check check (account_type in ('member', 'assistant'));
alter table public.user_roles drop constraint if exists user_roles_plan_check;
alter table public.user_roles
  add constraint user_roles_plan_check check (plan in ('free', 'plus'));
alter table public.user_roles drop constraint if exists user_roles_features_check;
alter table public.user_roles
  add constraint user_roles_features_check check (features <@ array['portfolio']::text[]);

-- Backfill from the legacy role. Only rows still at the column defaults are touched, so re-running never undoes a
-- change made later on the admin page (which always writes role + columns together).
--   main → member/free/{}   premium → member/plus/{}   premium_plus → member/plus/{portfolio}   assistant → assistant/free/{}
update public.user_roles set account_type = 'assistant', plan = 'free', features = '{}'
  where role = 'assistant' and account_type <> 'assistant';
update public.user_roles set plan = 'plus'
  where role = 'premium' and account_type = 'member' and plan = 'free' and features = '{}';
update public.user_roles set plan = 'plus', features = array['portfolio']::text[]
  where role = 'premium_plus' and account_type = 'member' and plan = 'free' and features = '{}';

-- ── 2. SECURITY: users must not change their own role / plan / add-ons ────────
-- Findings (specs/027 spec.md "RLS findings"): the migrations only ever created a SELECT policy on user_roles, and
-- every write in the app goes through the service role. But Supabase grants INSERT/UPDATE/DELETE on public tables to
-- anon/authenticated by default, so a policy added later (e.g. in the dashboard) would let a user self-escalate.
-- Fix: drop every non-SELECT policy, make sure the read policy exists, and revoke client write privileges.
alter table public.user_roles enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'user_roles' and cmd <> 'SELECT'
  loop
    execute format('drop policy if exists %I on public.user_roles', pol.policyname);
  end loop;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_roles' and policyname = 'authenticated users can read user_roles'
  ) then
    create policy "authenticated users can read user_roles"
      on public.user_roles for select to authenticated using (true);
  end if;
end $$;

revoke insert, update, delete, truncate on public.user_roles from anon, authenticated;

-- ── 3. customer_invitations: plan / features (admin-only invitations) ─────────
alter table public.customer_invitations add column if not exists plan     text   not null default 'free';
alter table public.customer_invitations add column if not exists features text[] not null default '{}';

alter table public.customer_invitations drop constraint if exists customer_invitations_plan_check;
alter table public.customer_invitations
  add constraint customer_invitations_plan_check check (plan in ('free', 'plus'));
alter table public.customer_invitations drop constraint if exists customer_invitations_features_check;
alter table public.customer_invitations
  add constraint customer_invitations_features_check check (features <@ array['portfolio']::text[]);

-- Backfill from the 026 role column (kept and still written for compatibility).
update public.customer_invitations set plan = 'plus'
  where role = 'premium' and plan = 'free' and features = '{}';
update public.customer_invitations set plan = 'plus', features = array['portfolio']::text[]
  where role = 'premium_plus' and plan = 'free' and features = '{}';

-- Invitations are created / resent / revoked only by admins through the API (service role). The 008 client policies
-- let any legacy 'premium' user insert invitation rows straight from the browser — drop them and revoke writes.
drop policy if exists "premium_select_own_invitations" on public.customer_invitations;
drop policy if exists "premium_insert_own_invitations" on public.customer_invitations;
revoke insert, update, delete, truncate on public.customer_invitations from anon, authenticated;

-- ── 4. delete_user(uuid) is SECURITY DEFINER and meant for the SQL editor only ─
-- Functions are executable by PUBLIC by default, i.e. any signed-in user could call it through the REST API.
do $$
begin
  if to_regprocedure('public.delete_user(uuid)') is not null then
    revoke execute on function public.delete_user(uuid) from public, anon, authenticated;
  end if;
end $$;

-- ── 5. audit_log.action: + user_plan_changed, user_features_changed, customer_invited,
--       customer_invitation_revoked (FULL list) ───────────────────────────────
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
    'customer_invitation_revoked'
  )) not valid;

commit;

-- Verify (optional) — 1) users per account type / plan / add-ons, 2) the legacy role next to it,
-- 3) security checks (expect: 0 client write policies, no client write grants, delete_user not executable).
select account_type, plan, features, role, count(*) as users
from public.user_roles
group by account_type, plan, features, role
order by account_type, plan, features, role;

select 'user_roles client write policies' as item, count(*)::text as result
from pg_policies where schemaname = 'public' and tablename = 'user_roles' and cmd <> 'SELECT'
union all
select 'user_roles writable by authenticated',
  (has_table_privilege('authenticated', 'public.user_roles', 'UPDATE')
   or has_table_privilege('authenticated', 'public.user_roles', 'INSERT'))::text
union all
select 'customer_invitations client policies', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'customer_invitations'
union all
select 'delete_user executable by authenticated',
  coalesce(has_function_privilege('authenticated', to_regprocedure('public.delete_user(uuid)'), 'EXECUTE')::text,
           'n/a (function missing)')
union all
select 'audit_log_action_check',
  case when pg_get_constraintdef(oid) like '%user_features_changed%' then 'includes user_* actions' else 'MISSING user_* actions' end
from pg_constraint where conname = 'audit_log_action_check';
