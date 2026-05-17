-- google_tokens: stores encrypted OAuth tokens, one row per owner
create table if not exists google_tokens (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  encrypted_access_token  text not null,
  encrypted_refresh_token text not null,
  token_iv                text not null,
  expires_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique(user_id)
);

alter table google_tokens enable row level security;
create policy "owner_own_tokens" on google_tokens
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- gmail_imported_messages: tracks imported message IDs to prevent re-import
create table if not exists gmail_imported_messages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  gmail_message_id text not null,
  trip_id          uuid references trips(id) on delete set null,
  imported_at      timestamptz not null default now(),
  unique(user_id, gmail_message_id)
);

alter table gmail_imported_messages enable row level security;
create policy "owner_own_imported" on gmail_imported_messages
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Add 'one_way' to the trip_type check constraint
alter table trips drop constraint if exists trips_trip_type_check;
alter table trips add constraint trips_trip_type_check
  check (trip_type in ('round_trip', 'multi_city', 'one_way'));
