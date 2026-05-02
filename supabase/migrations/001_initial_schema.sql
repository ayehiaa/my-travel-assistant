-- ============================================================
-- My Travel Assistant — Initial Schema
-- ============================================================

-- user_roles: maps Supabase Auth users to app roles
create table public.user_roles (
  user_id      uuid         primary key references auth.users(id) on delete cascade,
  role         varchar(20)  not null check (role in ('owner', 'assistant')),
  display_name varchar(100) not null,
  created_at   timestamptz  not null default now()
);

-- trips: saved round-trip flight records
create table public.trips (
  id                       uuid         primary key default gen_random_uuid(),
  departure_airport        varchar(3)   not null,
  destination_airport      varchar(3)   not null,
  outbound_airline         varchar(100) not null,
  outbound_flight_number   varchar(10)  not null,
  outbound_departure_at    timestamptz  not null,
  outbound_arrival_at      timestamptz  not null,
  return_airline           varchar(100) not null,
  return_flight_number     varchar(10)  not null,
  return_departure_at      timestamptz  not null,
  return_arrival_at        timestamptz  not null,
  days_outside_uk          integer      not null check (days_outside_uk >= 0),
  created_by               uuid         not null references auth.users(id),
  last_modified_by         uuid         not null references auth.users(id),
  created_at               timestamptz  not null default now(),
  updated_at               timestamptz  not null default now()
);

-- audit_log: append-only record of all trip mutations
create table public.audit_log (
  id             uuid        primary key default gen_random_uuid(),
  performed_by   uuid        not null references auth.users(id),
  action         varchar(20) not null check (action in ('created', 'updated', 'deleted')),
  trip_id        uuid        references public.trips(id) on delete set null,
  trip_snapshot  jsonb       not null,
  changed_fields jsonb,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- Trigger: keep trips.updated_at current on every update
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trips_set_updated_at
  before update on public.trips
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Row-Level Security
-- ============================================================

alter table public.user_roles enable row level security;
alter table public.trips      enable row level security;
alter table public.audit_log  enable row level security;

-- user_roles: any authenticated user can read (needed to resolve display names)
create policy "authenticated users can read user_roles"
  on public.user_roles
  for select
  to authenticated
  using (true);

-- trips: any authenticated user can read all trips
create policy "authenticated users can read trips"
  on public.trips
  for select
  to authenticated
  using (true);

-- trips: authenticated users can insert their own trips
create policy "authenticated users can insert trips"
  on public.trips
  for insert
  to authenticated
  with check (auth.uid() = created_by);

-- trips: authenticated users can update trips (last_modified_by must be the caller)
create policy "authenticated users can update trips"
  on public.trips
  for update
  to authenticated
  using (true)
  with check (auth.uid() = last_modified_by);

-- trips: only owner role can delete
create policy "owner can delete trips"
  on public.trips
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role = 'owner'
    )
  );

-- audit_log: any authenticated user can read
create policy "authenticated users can read audit_log"
  on public.audit_log
  for select
  to authenticated
  using (true);

-- audit_log: no client-side writes — service role only (no insert/update/delete policy)
