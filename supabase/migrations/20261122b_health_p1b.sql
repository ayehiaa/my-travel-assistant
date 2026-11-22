-- specs/029-health-routines — Phase P1b (training): workouts, workout sets, joint (pain) checks and professional
-- approvals for conditional unlocks. Idempotent. Requires 20261122_health_p1a.sql (health_daily_logs,
-- health_enrolments). The app keeps working without this migration: the Training tab shows "Training needs a
-- database update" and Today simply has no training card data.
--
-- Privacy: OWNER-ONLY RLS (user_id = auth.uid()) on every table; child rows must also belong to a workout of the
-- same user. No admin / assistant policies. No audit_log changes in this phase.

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
