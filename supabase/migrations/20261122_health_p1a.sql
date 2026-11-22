-- specs/029-health-routines — Phase P1a (daily loop): Health add-on, consent, programmes + enrolments, morning
-- check-ins, food logging (entries + items), personal food library, fired rule events, nutrition lookup cache,
-- private `health-photos` storage bucket. Idempotent. Requires 20261121b_plans_addons_admin.sql
-- (user_roles.features). The app keeps working without this migration: /health shows "Health needs a database
-- update", the admin cannot grant the Health add-on (clear error) and nothing else changes.
--
-- Privacy: every health table is OWNER-ONLY (RLS: user_id = auth.uid()); there is no admin / assistant read policy.
-- The admin page reads only the latest local_date per user (service role) for "last log date".

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
