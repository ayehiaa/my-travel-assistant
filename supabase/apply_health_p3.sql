-- =====================================================================================
-- Sojourn — Health module, phase P3: convenience (combined, run once)
-- Paste this whole script into Supabase → SQL Editor → New query → Run.
--
-- Contains:
--   20261122d_health_p3.sql   (specs/029-health-routines, phase P3)
--     * health_programmes + lineage_id, parent_id, version_no, source, change_summary (programme versions)
--     * tables health_programme_imports, health_meal_plans, health_ingredient_cache (OWNER-ONLY RLS)
--     * health_workout_sets + client_id, client_updated_at (offline sync: last write wins per set)
--     * audit_log.action + health_programme_imported, health_programme_updated, health_data_exported,
--       health_data_deleted (full list)
--
-- Requires: supabase/apply_health_p1a.sql, apply_health_p1b.sql and apply_health_p2.sql — checked below.
-- Safe to re-run: every change is IF NOT EXISTS / drop-and-recreate.
-- Runs in ONE transaction: if any statement fails, nothing is changed.
-- =====================================================================================

begin;

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

-- Verify (optional) — expect the 3 P3 tables with RLS on and 1 owner policy each, and the new columns.
select c.relname as table_name, c.relrowsecurity as rls_on,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('health_programme_imports', 'health_meal_plans', 'health_ingredient_cache')
order by c.relname;

select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'health_programmes' and column_name in ('lineage_id', 'parent_id', 'version_no', 'source', 'change_summary'))
    or (table_name = 'health_workout_sets' and column_name in ('client_id', 'client_updated_at')))
order by table_name, column_name;
