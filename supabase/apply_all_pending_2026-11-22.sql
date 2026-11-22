-- =====================================================================================
-- Sojourn — ALL pending database updates in ONE script (run once)
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
--
-- Prerequisite: apply_trading_features_2026-11-20.sql has already been run (you did this).
--
-- Contains, in order:
--   1. Friend onboarding      (invitation roles, encrypted user AI keys)
--   2. Plans, add-ons, admin  (account type / plan / add-ons, RLS hardening)
--   3. Health P1a             (programmes, enrolment, check-ins, food logging, photo bucket)
--   4. Health P1b             (workouts, sets, joint checks, approvals)
--   5. Health P2              (cardio, steps, adjustments, measurements, labs, reviews, reminders, push)
--   6. Health P3              (programme import + versions, meal plans, offline sync columns)
--
-- ONE transaction: if anything fails, NOTHING is changed. Safe to re-run: every part is idempotent,
-- so it also works if you already ran some of the individual scripts.
-- Each part keeps its own pre-checks; the audit-log rule ends with the complete action list (part 6).
-- =====================================================================================

begin;

-- =====================================================================================
-- PART 1/6 — apply_friend_onboarding_2026-11-21.sql
-- =====================================================================================
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

-- =====================================================================================
-- PART 2/6 — apply_plans_addons_admin.sql
-- =====================================================================================
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

-- =====================================================================================
-- PART 3/6 — apply_health_p1a.sql
-- =====================================================================================
-- 0. Pre-checks: stop with a clear message if earlier migrations were never applied.
do $$
begin
  if to_regclass('public.user_roles') is null then
    raise exception 'Missing table public.user_roles';
  end if;
  if to_regclass('public.audit_log') is null then
    raise exception 'Missing table public.audit_log';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_roles' and column_name = 'features'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_invitations' and column_name = 'features'
  ) then
    raise exception 'Plans and add-ons not applied yet — run supabase/apply_plans_addons_admin.sql first';
  end if;
  if exists (select 1 from public.user_roles where not (features <@ array['portfolio', 'health']::text[])) then
    raise exception 'user_roles.features has unexpected values — fix them before running this script';
  end if;
end $$;

-- ── 1. Add-on key 'health' ─────────────────────────────────────────────────────
alter table public.user_roles drop constraint if exists user_roles_features_check;
alter table public.user_roles
  add constraint user_roles_features_check check (features <@ array['portfolio', 'health']::text[]);

alter table public.customer_invitations drop constraint if exists customer_invitations_features_check;
alter table public.customer_invitations
  add constraint customer_invitations_features_check check (features <@ array['portfolio', 'health']::text[]);

-- ── 2. Tables ─────────────────────────────────────────────────────────────────

-- Consent (UK GDPR special-category data): one row per consent given; withdrawn_at set on withdrawal.
create table if not exists public.health_consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  consent_version text not null,
  scope           text not null default 'health_data',
  consented_at    timestamptz not null default now(),
  withdrawn_at    timestamptz
);
create index if not exists health_consents_user_idx on public.health_consents (user_id, consented_at desc);

-- A user's programme definition (a copy of a code template, or later an imported programme). JSON validated in code
-- (src/lib/health/programmeSchema.ts). A change creates a new row (versioning); enrolments point at one row.
create table if not exists public.health_programmes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  template_key text,
  name         text not null,
  version      text not null default '1',
  definition   jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists health_programmes_user_idx on public.health_programmes (user_id, created_at desc);

create table if not exists public.health_enrolments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  programme_id      uuid not null references public.health_programmes(id) on delete restrict,
  start_date        date not null,
  timezone          text not null default 'Europe/London',
  profile           jsonb not null,
  overrides         jsonb not null default '{}'::jsonb,
  effective_targets jsonb not null,
  status            text not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint health_enrolments_status_check check (status in ('active', 'paused', 'completed'))
);
create unique index if not exists health_enrolments_one_active
  on public.health_enrolments (user_id) where status = 'active';

-- One row per user per LOCAL date (enrolment timezone).
create table if not exists public.health_daily_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_daily_logs_user_date_key unique (user_id, local_date)
);

create table if not exists public.health_checkins (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  daily_log_id      uuid not null references public.health_daily_logs(id) on delete cascade,
  local_date        date not null,
  weight_kg         numeric(5,2),
  bed_time          text,
  wake_time         text,
  supplements_taken text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint health_checkins_user_date_key unique (user_id, local_date),
  constraint health_checkins_weight_check check (weight_kg is null or (weight_kg >= 30 and weight_kg <= 350)),
  constraint health_checkins_bed_check  check (bed_time  is null or bed_time  ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint health_checkins_wake_check check (wake_time is null or wake_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

create table if not exists public.health_food_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  daily_log_id uuid not null references public.health_daily_logs(id) on delete cascade,
  local_date   date not null,
  local_time   text not null,
  eaten_at     timestamptz not null,
  slot         text,
  input_text   text,
  restaurant   boolean not null default false,
  photo_paths  text[] not null default '{}',
  ai_usage     jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint health_food_entries_time_check check (local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint health_food_entries_photos_check check (cardinality(photo_paths) <= 4)
);
create index if not exists health_food_entries_user_date_idx on public.health_food_entries (user_id, local_date);

-- Personal food library: values per 100 g (+ programme components per 100 g) and a default portion.
create table if not exists public.health_food_library (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null,
  normalized_name    text not null,
  default_quantity_g numeric(7,1) not null default 100,
  per100             jsonb not null,
  is_treat           boolean not null default false,
  uses_count         integer not null default 0,
  last_used_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint health_food_library_user_name_key unique (user_id, normalized_name)
);

create table if not exists public.health_food_items (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.health_food_entries(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  position    integer not null default 0,
  name        text not null,
  quantity_g  numeric(7,1) not null default 0,
  kcal        numeric(7,1) not null default 0,
  protein_g   numeric(6,1) not null default 0,
  carbs_g     numeric(6,1) not null default 0,
  fat_g       numeric(6,1) not null default 0,
  sat_fat_g   numeric(6,1) not null default 0,
  fibre_g     numeric(6,1) not null default 0,
  components  jsonb not null default '{}'::jsonb,
  confidence  text not null default 'medium',
  is_treat    boolean not null default false,
  source      text not null default 'manual',
  library_id  uuid references public.health_food_library(id) on delete set null,
  off_code    text,
  created_at  timestamptz not null default now(),
  constraint health_food_items_confidence_check check (confidence in ('low', 'medium', 'high')),
  constraint health_food_items_source_check check (source in ('ai', 'library', 'off', 'manual'))
);
create index if not exists health_food_items_entry_idx on public.health_food_items (entry_id, position);
create index if not exists health_food_items_user_idx on public.health_food_items (user_id);

-- Fired rules / recommendations, one row per user + local date + rule key (re-firing updates last_fired_at).
create table if not exists public.health_rule_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  local_date     date not null,
  rule_key       text not null,
  rule_type      text not null,
  rec_group      text not null,
  priority       integer not null default 0,
  message        text not null,
  data           jsonb,
  first_fired_at timestamptz not null default now(),
  last_fired_at  timestamptz not null default now(),
  constraint health_rule_events_user_date_key unique (user_id, local_date, rule_key)
);

-- Public nutrition-database lookups (Open Food Facts), shared cache — no personal data. Service role only.
create table if not exists public.health_nutrition_cache (
  cache_key  text primary key,
  source     text not null,
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);

-- ── 3. RLS: owner-only on every health table ──────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'health_consents', 'health_programmes', 'health_enrolments', 'health_daily_logs', 'health_checkins',
    'health_food_entries', 'health_food_library', 'health_food_items', 'health_rule_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Owner full access" on public.%I', t);
    execute format(
      'create policy "Owner full access" on public.%I for all to authenticated ' ||
      'using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Food items must also belong to an entry of the same user.
drop policy if exists "Owner full access" on public.health_food_items;
create policy "Owner full access" on public.health_food_items for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.health_food_entries e where e.id = entry_id and e.user_id = auth.uid())
  );

-- Enrolments must point at the user's own programme.
drop policy if exists "Owner full access" on public.health_enrolments;
create policy "Owner full access" on public.health_enrolments for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.health_programmes p where p.id = programme_id and p.user_id = auth.uid())
  );

alter table public.health_nutrition_cache enable row level security;
revoke all on public.health_nutrition_cache from anon, authenticated;

-- ── 4. Private storage bucket for food photos (service role only; signed URLs) ─
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('health-photos', 'health-photos', false)
    on conflict (id) do update set public = false;
  end if;
end $$;

-- ── 5. audit_log.action: + health_consent_given, health_programme_activated (FULL list) ─
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
    'health_programme_activated'
  )) not valid;

-- =====================================================================================
-- PART 4/6 — apply_health_p1b.sql
-- =====================================================================================
-- 0. Pre-checks: stop with a clear message if Health P1a was never applied.
do $$
begin
  if to_regclass('public.health_daily_logs') is null
     or to_regclass('public.health_enrolments') is null
     or to_regclass('public.health_checkins') is null then
    raise exception 'Health P1a not applied yet — run supabase/apply_health_p1a.sql first';
  end if;
end $$;

-- ── 1. Tables ─────────────────────────────────────────────────────────────────

-- One logged session per user + local date + session key (re-saving the same session updates it).
create table if not exists public.health_workouts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  daily_log_id      uuid references public.health_daily_logs(id) on delete cascade,
  enrolment_id      uuid references public.health_enrolments(id) on delete set null,
  local_date        date not null,
  session_key       text not null,
  block_key         text,
  programme_week    integer,
  status            text not null,
  skip_reason       text,
  travel_mode       boolean not null default false,
  duration_minutes  integer,
  notes             text,
  skipped_exercises jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint health_workouts_user_date_session_key unique (user_id, local_date, session_key),
  constraint health_workouts_status_check check (status in ('done', 'partial', 'skipped')),
  constraint health_workouts_skip_reason_check check (status <> 'skipped' or skip_reason is not null),
  constraint health_workouts_week_check check (programme_week is null or (programme_week >= 1 and programme_week <= 104)),
  constraint health_workouts_duration_check check (duration_minutes is null or (duration_minutes >= 0 and duration_minutes <= 600))
);
create index if not exists health_workouts_user_date_idx on public.health_workouts (user_id, local_date desc);

-- Sets: one row per set (a drop set is an extra row with is_drop_set = true on the same set_index).
create table if not exists public.health_workout_sets (
  id                uuid primary key default gen_random_uuid(),
  workout_id        uuid not null references public.health_workouts(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  exercise_key      text not null,
  set_index         integer not null,
  load_kg           numeric(6,2),
  reps              integer,
  hold_seconds      integer,
  rir               integer,
  to_failure        boolean not null default false,
  is_drop_set       boolean not null default false,
  substitution_name text,
  created_at        timestamptz not null default now(),
  constraint health_workout_sets_key unique (workout_id, exercise_key, set_index, is_drop_set),
  constraint health_workout_sets_index_check check (set_index >= 0 and set_index < 20),
  constraint health_workout_sets_load_check check (load_kg is null or (load_kg >= 0 and load_kg <= 500)),
  constraint health_workout_sets_reps_check check (reps is null or (reps >= 0 and reps <= 200)),
  constraint health_workout_sets_hold_check check (hold_seconds is null or (hold_seconds >= 0 and hold_seconds <= 1800)),
  constraint health_workout_sets_rir_check check (rir is null or (rir >= 0 and rir <= 5))
);
create index if not exists health_workout_sets_user_exercise_idx on public.health_workout_sets (user_id, exercise_key);
create index if not exists health_workout_sets_workout_idx on public.health_workout_sets (workout_id);

-- Joint checks: one per pain-check workout (during-session score, then the next-morning answer).
create table if not exists public.health_joint_checks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  workout_id        uuid not null references public.health_workouts(id) on delete cascade,
  local_date        date not null,
  session_key       text not null,
  during_pain       integer,
  next_morning_pain integer,
  next_morning_date date,
  swelling          boolean not null default false,
  red_flags         text[] not null default '{}',
  physio_cleared    boolean not null default false,
  cleared_on        date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint health_joint_checks_workout_key unique (workout_id),
  constraint health_joint_checks_during_check check (during_pain is null or (during_pain >= 0 and during_pain <= 10)),
  constraint health_joint_checks_morning_check check (next_morning_pain is null or (next_morning_pain >= 0 and next_morning_pain <= 10))
);
create index if not exists health_joint_checks_user_date_idx on public.health_joint_checks (user_id, local_date desc);

-- "Approved by my physio" for conditional unlocks that need professional approval (e.g. step-ups).
create table if not exists public.health_professional_approvals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  unlock_key  text not null,
  approved_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint health_professional_approvals_user_key unique (user_id, unlock_key)
);

-- ── 2. RLS: owner-only ────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['health_workouts', 'health_workout_sets', 'health_joint_checks', 'health_professional_approvals']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Owner full access" on public.%I', t);
    execute format(
      'create policy "Owner full access" on public.%I for all to authenticated ' ||
      'using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Sets and joint checks must belong to a workout of the same user.
drop policy if exists "Owner full access" on public.health_workout_sets;
create policy "Owner full access" on public.health_workout_sets for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.health_workouts w where w.id = workout_id and w.user_id = auth.uid())
  );

drop policy if exists "Owner full access" on public.health_joint_checks;
create policy "Owner full access" on public.health_joint_checks for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.health_workouts w where w.id = workout_id and w.user_id = auth.uid())
  );

-- Workouts may only reference the user's own daily log / enrolment.
drop policy if exists "Owner full access" on public.health_workouts;
create policy "Owner full access" on public.health_workouts for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (daily_log_id is null or exists (select 1 from public.health_daily_logs l where l.id = daily_log_id and l.user_id = auth.uid()))
    and (enrolment_id is null or exists (select 1 from public.health_enrolments e where e.id = enrolment_id and e.user_id = auth.uid()))
  );

-- =====================================================================================
-- PART 5/6 — apply_health_p2.sql
-- =====================================================================================
-- 0. Pre-checks: stop with a clear message if an earlier Health phase was never applied.
do $$
begin
  if to_regclass('public.health_daily_logs') is null
     or to_regclass('public.health_enrolments') is null
     or to_regclass('public.health_checkins') is null then
    raise exception 'Health P1a not applied yet — run supabase/apply_health_p1a.sql first';
  end if;
  if to_regclass('public.health_workouts') is null
     or to_regclass('public.health_joint_checks') is null then
    raise exception 'Health P1b not applied yet — run supabase/apply_health_p1b.sql first';
  end if;
end $$;

-- ── 1. Tables ─────────────────────────────────────────────────────────────────

-- Cardio sessions (type from the programme's allowed list; avoid-list types are confirmed in the app before saving).
create table if not exists public.health_cardio_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  daily_log_id uuid references public.health_daily_logs(id) on delete cascade,
  local_date   date not null,
  cardio_type  text not null,
  minutes      integer not null,
  avg_hr       integer,
  intervals    boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  constraint health_cardio_minutes_check check (minutes >= 1 and minutes <= 300),
  constraint health_cardio_hr_check check (avg_hr is null or (avg_hr >= 40 and avg_hr <= 220)),
  constraint health_cardio_type_check check (char_length(cardio_type) between 1 and 80)
);
create index if not exists health_cardio_user_date_idx on public.health_cardio_sessions (user_id, local_date desc);

-- Daily steps (manual entry — owner decision §12.2): one row per user + local date.
create table if not exists public.health_steps (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  steps      integer not null,
  updated_at timestamptz not null default now(),
  constraint health_steps_user_date_key unique (user_id, local_date),
  constraint health_steps_range_check check (steps >= 0 and steps <= 100000)
);

-- Fortnightly adjustment decisions (accepted → effective targets updated; declined → recorded).
create table if not exists public.health_adjustments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  enrolment_id   uuid not null references public.health_enrolments(id) on delete cascade,
  period_end     date not null,
  status         text not null,
  kcal_change    integer not null default 0,
  loss_kg        numeric(5,2),
  reasoning      text,
  targets_before jsonb,
  targets_after  jsonb,
  decided_at     timestamptz not null default now(),
  constraint health_adjustments_period_key unique (enrolment_id, period_end),
  constraint health_adjustments_status_check check (status in ('accepted', 'declined')),
  constraint health_adjustments_kcal_check check (kcal_change between -1000 and 1000)
);
create index if not exists health_adjustments_user_idx on public.health_adjustments (user_id, period_end desc);

-- Body measurements (waist in cm; one per user + date + kind).
create table if not exists public.health_measurements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  kind       text not null default 'waist',
  value      numeric(6,2) not null,
  created_at timestamptz not null default now(),
  constraint health_measurements_key unique (user_id, local_date, kind),
  constraint health_measurements_kind_check check (kind in ('waist')),
  constraint health_measurements_value_check check (value > 0 and value < 1000)
);

-- Progress photos (private bucket health-photos, path progress/<user>/<date>/<uuid>.jpg; never auto-deleted).
create table if not exists public.health_progress_photos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  path       text not null,
  created_at timestamptz not null default now(),
  constraint health_progress_photos_path_key unique (path)
);
create index if not exists health_progress_photos_user_idx on public.health_progress_photos (user_id, local_date desc);

-- Lipid panels (stored in mmol/L; entered unit kept for display history).
create table if not exists public.health_lab_results (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  taken_on     date not null,
  total_mmol   numeric(5,2),
  ldl_mmol     numeric(5,2),
  hdl_mmol     numeric(5,2),
  tg_mmol      numeric(5,2),
  entered_unit text not null default 'mmol',
  notes        text,
  created_at   timestamptz not null default now(),
  constraint health_lab_results_unit_check check (entered_unit in ('mmol', 'mgdl'))
);
create index if not exists health_lab_results_user_idx on public.health_lab_results (user_id, taken_on desc);

-- Milestone checklist ticks (per enrolment + task key).
create table if not exists public.health_milestone_checks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  enrolment_id uuid not null references public.health_enrolments(id) on delete cascade,
  week         integer not null,
  task_key     text not null,
  done_at      timestamptz not null default now(),
  constraint health_milestone_checks_key unique (enrolment_id, task_key)
);

-- Weekly reviews (one per user + ISO week; data = computed stats + focus points, no food details).
create table if not exists public.health_weekly_reviews (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_weekly_reviews_key unique (user_id, week_start)
);

-- Health settings: units + reminders (jsonb, read defensively in code).
create table if not exists public.health_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  units      jsonb not null default '{}'::jsonb,
  reminders  jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Per-day timezone override (travel days); missing → enrolment timezone.
create table if not exists public.health_day_timezones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  timezone   text not null,
  created_at timestamptz not null default now(),
  constraint health_day_timezones_key unique (user_id, local_date),
  constraint health_day_timezones_tz_check check (char_length(timezone) between 1 and 64)
);

-- Web Push subscriptions (one row per browser endpoint).
create table if not exists public.health_push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  failure_count   integer not null default 0,
  last_success_at timestamptz,
  created_at      timestamptz not null default now(),
  constraint health_push_subscriptions_endpoint_key unique (endpoint)
);
create index if not exists health_push_subscriptions_user_idx on public.health_push_subscriptions (user_id);

-- ── 2. RLS: owner-only ────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['health_cardio_sessions', 'health_steps', 'health_adjustments', 'health_measurements',
    'health_progress_photos', 'health_lab_results', 'health_milestone_checks', 'health_weekly_reviews',
    'health_settings', 'health_day_timezones', 'health_push_subscriptions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Owner full access" on public.%I', t);
    execute format(
      'create policy "Owner full access" on public.%I for all to authenticated ' ||
      'using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Children must reference the user's own enrolment / daily log.
drop policy if exists "Owner full access" on public.health_adjustments;
create policy "Owner full access" on public.health_adjustments for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from public.health_enrolments e where e.id = enrolment_id and e.user_id = auth.uid()));

drop policy if exists "Owner full access" on public.health_milestone_checks;
create policy "Owner full access" on public.health_milestone_checks for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from public.health_enrolments e where e.id = enrolment_id and e.user_id = auth.uid()));

drop policy if exists "Owner full access" on public.health_cardio_sessions;
create policy "Owner full access" on public.health_cardio_sessions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and (daily_log_id is null or exists (select 1 from public.health_daily_logs l where l.id = daily_log_id and l.user_id = auth.uid())));

-- Progress photo paths must sit in the user's own progress folder.
drop policy if exists "Owner full access" on public.health_progress_photos;
create policy "Owner full access" on public.health_progress_photos for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and path like 'progress/' || auth.uid()::text || '/%');

-- ── 3. audit_log.action: + health_adjustment_accepted, health_adjustment_declined (FULL list) ─
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
    'health_adjustment_declined'
  )) not valid;

-- =====================================================================================
-- PART 6/6 — apply_health_p3.sql
-- =====================================================================================
-- 0. Pre-checks: stop with a clear message if an earlier Health phase was never applied.
do $$
begin
  if to_regclass('public.health_daily_logs') is null
     or to_regclass('public.health_enrolments') is null
     or to_regclass('public.health_programmes') is null then
    raise exception 'Health P1a not applied yet — run supabase/apply_health_p1a.sql first';
  end if;
  if to_regclass('public.health_workouts') is null
     or to_regclass('public.health_workout_sets') is null then
    raise exception 'Health P1b not applied yet — run supabase/apply_health_p1b.sql first';
  end if;
  if to_regclass('public.health_settings') is null
     or to_regclass('public.health_cardio_sessions') is null
     or to_regclass('public.health_progress_photos') is null then
    raise exception 'Health P2 not applied yet — run supabase/apply_health_p2.sql first';
  end if;
end $$;

-- ── 1. Programme versioning (columns on health_programmes) ───────────────────
alter table public.health_programmes add column if not exists lineage_id     uuid;
alter table public.health_programmes add column if not exists parent_id      uuid references public.health_programmes(id) on delete set null;
alter table public.health_programmes add column if not exists version_no     integer not null default 1;
alter table public.health_programmes add column if not exists source         text not null default 'template';
alter table public.health_programmes add column if not exists change_summary jsonb;

alter table public.health_programmes drop constraint if exists health_programmes_source_check;
alter table public.health_programmes
  add constraint health_programmes_source_check check (source in ('template', 'import', 'edit'));
alter table public.health_programmes drop constraint if exists health_programmes_version_no_check;
alter table public.health_programmes
  add constraint health_programmes_version_no_check check (version_no >= 1);

-- Existing rows: each is the first version of its own lineage.
update public.health_programmes set lineage_id = id where lineage_id is null;
create index if not exists health_programmes_lineage_idx on public.health_programmes (user_id, lineage_id, version_no desc);

-- ── 2. Tables ─────────────────────────────────────────────────────────────────

-- Programme import drafts (AI extraction → section-by-section review). The uploaded file itself is never stored.
create table if not exists public.health_programme_imports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  status         text not null default 'draft',
  source_kind    text not null,
  file_name      text,
  sections       jsonb not null default '{}'::jsonb,
  statuses       jsonb not null default '{}'::jsonb,
  notes          jsonb not null default '{}'::jsonb,
  confirmed      text[] not null default '{}',
  programme_id   uuid references public.health_programmes(id) on delete set null,
  ai_usage       jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint health_programme_imports_status_check check (status in ('draft', 'saved', 'discarded')),
  constraint health_programme_imports_kind_check check (source_kind in ('pdf', 'text'))
);
create index if not exists health_programme_imports_user_idx on public.health_programme_imports (user_id, created_at desc);

-- Meal plan per ISO week (Monday): swaps (day:slot → option) and shopping-list ticks (ingredient keys).
create table if not exists public.health_meal_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  week_start  date not null,
  choices     jsonb not null default '{}'::jsonb,
  checked     text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  constraint health_meal_plans_key unique (user_id, week_start),
  constraint health_meal_plans_monday_check check (extract(isodow from week_start) = 1)
);

-- AI ingredient splits of meal-plan options the built-in dictionary does not know (cached per user).
create table if not exists public.health_ingredient_cache (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  part_key    text not null,
  ingredients jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  constraint health_ingredient_cache_key unique (user_id, part_key),
  constraint health_ingredient_cache_part_check check (char_length(part_key) between 1 and 200)
);

-- ── 3. Offline set sync: last write wins per set index ───────────────────────
alter table public.health_workout_sets add column if not exists client_id         text;
alter table public.health_workout_sets add column if not exists client_updated_at timestamptz;

-- ── 4. RLS: owner-only ────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['health_programme_imports', 'health_meal_plans', 'health_ingredient_cache']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Owner full access" on public.%I', t);
    execute format(
      'create policy "Owner full access" on public.%I for all to authenticated ' ||
      'using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- An import draft may only point at the user's own programme.
drop policy if exists "Owner full access" on public.health_programme_imports;
create policy "Owner full access" on public.health_programme_imports for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and (programme_id is null or exists (select 1 from public.health_programmes p where p.id = programme_id and p.user_id = auth.uid())));

-- ── 5. audit_log.action: + programme import / update, health data export / delete (FULL list) ─
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
    'health_data_deleted'
  )) not valid;

commit;

-- =====================================================================================
-- Verify (optional) — every row should say OK.
-- =====================================================================================
select item, case when ok then 'OK' else 'MISSING' end as status from (values
  ('customer_invitations.role / plan / features',
     exists (select 1 from information_schema.columns where table_schema='public' and table_name='customer_invitations' and column_name='features')),
  ('user_ai_credentials table', to_regclass('public.user_ai_credentials') is not null),
  ('user_roles account_type / plan / features',
     exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_roles' and column_name='features')),
  ('user_roles not writable by logged-in users',
     not (has_table_privilege('authenticated','public.user_roles','UPDATE') or has_table_privilege('authenticated','public.user_roles','INSERT'))),
  ('health tables (P1a–P3), all with RLS on',
     (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r' and c.relname like 'health\_%' and not c.relrowsecurity) = 0
     and (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r' and c.relname like 'health\_%') >= 20),
  ('storage bucket health-photos (private)',
     exists (select 1 from storage.buckets where id='health-photos' and not public)),
  ('audit log allows the newest actions',
     exists (select 1 from pg_constraint where conname='audit_log_action_check'
       and pg_get_constraintdef(oid) like '%health_adjustment_declined%'))
) as t(item, ok);
