-- ============================================================================
-- BLACKJACKED — chat for 1v1 matches
-- ============================================================================

create table if not exists public.match_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists match_messages_match_idx on public.match_messages (match_id, created_at);

alter table public.match_messages enable row level security;

drop policy if exists "players can read their match chat" on public.match_messages;
create policy "players can read their match chat"
  on public.match_messages for select
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_messages.match_id
        and (m.player_a = auth.uid() or m.player_b = auth.uid())
    )
  );

drop policy if exists "players can send in their match chat" on public.match_messages;
create policy "players can send in their match chat"
  on public.match_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_messages.match_id
        and (m.player_a = auth.uid() or m.player_b = auth.uid())
        and m.player_b is not null -- no chat in solo campaign matches
    )
  );

alter publication supabase_realtime add table public.match_messages;
