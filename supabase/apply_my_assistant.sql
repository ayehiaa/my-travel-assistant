-- =====================================================================================
-- Sojourn — My Assistant (combined, run once)
-- Paste this whole script into Supabase → SQL Editor → New query → Run.
--
-- Contains:
--   20261126_my_assistant.sql   (specs/033-my-assistant)
--     * tables assistant_conversations, assistant_messages (OWNER-ONLY RLS, messages append-only)
--
-- Requires: supabase/apply_screening_settings.sql (the latest earlier script) — checked below.
-- Safe to re-run: every change is IF NOT EXISTS / drop-and-recreate.
-- Runs in ONE transaction: if any statement fails, nothing is changed.
-- =====================================================================================

begin;

-- 0. Pre-check: the previous script must have been applied first.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'portfolio_settings' and column_name = 'screening_settings'
  ) then
    raise exception 'Screening settings not applied yet — run supabase/apply_screening_settings.sql first';
  end if;
end $$;

create table if not exists public.assistant_conversations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  title          text not null default 'New chat',
  areas          text[] not null default '{}',
  total_cost_usd numeric(12,6) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint assistant_conversations_title_check check (char_length(title) between 1 and 120),
  constraint assistant_conversations_areas_check check (areas <@ array['travel','expenses','lifestyle','trading']::text[]),
  constraint assistant_conversations_cost_check check (total_cost_usd >= 0)
);
create index if not exists assistant_conversations_user_updated_idx
  on public.assistant_conversations (user_id, updated_at desc);

create table if not exists public.assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated always as identity,
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null,
  content         jsonb not null,
  text_preview    text,
  usage           jsonb,
  created_at      timestamptz not null default now(),
  constraint assistant_messages_role_check check (role in ('user', 'assistant')),
  constraint assistant_messages_content_check check (jsonb_typeof(content) = 'array'),
  constraint assistant_messages_preview_check check (text_preview is null or char_length(text_preview) <= 400)
);
create index if not exists assistant_messages_conversation_seq_idx on public.assistant_messages (conversation_id, seq);
create index if not exists assistant_messages_user_created_idx on public.assistant_messages (user_id, created_at desc);

-- Append-only: block every UPDATE of a message (also for the service role).
create or replace function public.assistant_messages_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'assistant_messages is append-only';
end $$;

drop trigger if exists assistant_messages_no_update on public.assistant_messages;
create trigger assistant_messages_no_update
  before update on public.assistant_messages
  for each row execute function public.assistant_messages_append_only();

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

drop policy if exists "Owner select" on public.assistant_conversations;
drop policy if exists "Owner insert" on public.assistant_conversations;
drop policy if exists "Owner update" on public.assistant_conversations;
drop policy if exists "Owner delete" on public.assistant_conversations;
create policy "Owner select" on public.assistant_conversations for select to authenticated
  using (user_id = auth.uid());
create policy "Owner insert" on public.assistant_conversations for insert to authenticated
  with check (user_id = auth.uid());
create policy "Owner update" on public.assistant_conversations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Owner delete" on public.assistant_conversations for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "Owner select" on public.assistant_messages;
drop policy if exists "Owner insert" on public.assistant_messages;
create policy "Owner select" on public.assistant_messages for select to authenticated
  using (user_id = auth.uid());
create policy "Owner insert" on public.assistant_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.assistant_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

commit;

-- Verify (optional) — expect both tables with RLS on, and the append-only trigger.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('assistant_conversations', 'assistant_messages');

select tgname from pg_trigger where tgname = 'assistant_messages_no_update';
