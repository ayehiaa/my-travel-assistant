-- =====================================================================================
-- Sojourn — Health module, phase P2: feedback loop (combined, run once)
-- Paste this whole script into Supabase → SQL Editor → New query → Run.
--
-- Contains:
--   20261122c_health_p2.sql   (specs/029-health-routines, phase P2)
--     * tables health_cardio_sessions, health_steps, health_adjustments, health_measurements,
--       health_progress_photos, health_lab_results, health_milestone_checks, health_weekly_reviews,
--       health_settings, health_day_timezones, health_push_subscriptions (OWNER-ONLY RLS)
--     * audit_log.action + health_adjustment_accepted, health_adjustment_declined (full list)
--
-- Requires: supabase/apply_health_p1a.sql and supabase/apply_health_p1b.sql — checked below.
-- Safe to re-run: every change is IF NOT EXISTS / drop-and-recreate.
-- Runs in ONE transaction: if any statement fails, nothing is changed.
-- =====================================================================================

begin;

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

commit;

-- Verify (optional) — expect the 11 P2 tables with RLS on and 1 owner policy each.
select c.relname as table_name, c.relrowsecurity as rls_on,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('health_cardio_sessions', 'health_steps', 'health_adjustments', 'health_measurements',
    'health_progress_photos', 'health_lab_results', 'health_milestone_checks', 'health_weekly_reviews',
    'health_settings', 'health_day_timezones', 'health_push_subscriptions')
order by c.relname;
