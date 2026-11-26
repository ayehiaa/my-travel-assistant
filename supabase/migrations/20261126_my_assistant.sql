-- My Assistant (specs/033-my-assistant)
-- 1. assistant_conversations — one row per chat (owner only). `areas` = the data areas frozen at creation so every
--    request of a conversation sends the same tools (Claude's replayed thinking needs a byte-identical prefix).
-- 2. assistant_messages — APPEND-ONLY turns. `content` holds the exact Claude API content blocks (thinking blocks
--    included) for assistant turns, and the user's context block + question (or tool results) for user turns.
--    No update policy, and a trigger rejects any UPDATE even with the service role. Deleting a conversation deletes
--    its messages (cascade).
-- Owner-only RLS on both tables: select / insert own rows; conversations may be renamed (title, cost, updated_at)
-- and deleted by their owner. Nothing here is written to audit_log (chats may mention health data).
-- Idempotent.

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
