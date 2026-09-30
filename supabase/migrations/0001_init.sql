-- ============================================================================
-- BLACKJACKED — initial schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
-- Safe to re-run: every statement is idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PROFILES
-- One row per registered player. Created automatically when someone signs up
-- (see the trigger at the bottom). Rating/tokens/stats are never writable
-- directly by the client (see RLS below) — only the server (service role)
-- updates them, after validating a completed match.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 16),
  rating double precision not null default 1500,
  rd double precision not null default 350,
  vol double precision not null default 0.06,
  wins int not null default 0,
  losses int not null default 0,
  streak int not null default 0,
  best_streak int not null default 0,
  matches_played int not null default 0,
  tokens int not null default 0,
  tokens_earned_total int not null default 0,
  perks jsonb not null default '[]'::jsonb,
  campaign_pos int not null default 0,
  campaign_wins int not null default 0,
  achievements jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{"blackjacks":0,"busts":0,"doubles":0,"splits":0,"kos":0,"comebackWins":0,"ironWillSaves":0}'::jsonb,
  preferred_class text not null default 'dealer' check (preferred_class in ('dealer', 'counter', 'gambler')),
  preferred_perks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_rating_idx on public.profiles (rating desc);
create index if not exists profiles_username_idx on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

-- Players may only edit their own username / preferred build via RLS...
drop policy if exists "users can update their own username" on public.profiles;
create policy "users can update their own username"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ...and column-level grants make sure that update can only ever touch the
-- harmless columns. Rating, tokens, achievements, stats etc. are simply not
-- grantable to the authenticated role, so even a permissive RLS policy can't
-- let a client write them — only the service role (server) can, and it
-- bypasses grants and RLS entirely.
revoke update on public.profiles from authenticated;
grant update (username, preferred_class, preferred_perks) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- FRIENDSHIPS
-- One row per requested/accepted friendship, directional (requester -> addressee).
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_friend check (requester_id <> addressee_id),
  constraint unique_pair unique (requester_id, addressee_id)
);

create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);

alter table public.friendships enable row level security;

drop policy if exists "see own friendships" on public.friendships;
create policy "see own friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "send friend requests" on public.friendships;
create policy "send friend requests"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

drop policy if exists "respond to own incoming requests" on public.friendships;
create policy "respond to own incoming requests"
  on public.friendships for update
  using (auth.uid() = addressee_id or auth.uid() = requester_id)
  with check (auth.uid() = addressee_id or auth.uid() = requester_id);

drop policy if exists "remove own friendships" on public.friendships;
create policy "remove own friendships"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ---------------------------------------------------------------------------
-- MATCHES
-- `state` holds the full server-authoritative game-reducer state (JSON) —
-- identical shape to the original local game engine. Only the server
-- (service role, via /api routes) ever writes to `state`; clients only read,
-- via realtime subscription, and POST *intents* (bet/hit/stand/...) which the
-- server validates and applies.
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  player_a uuid not null references public.profiles(id) on delete cascade,
  player_b uuid references public.profiles(id) on delete cascade, -- null when vs. a bot
  is_campaign boolean not null default false,
  bot_index int,
  state jsonb not null,
  winner uuid references public.profiles(id),
  finalized boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists matches_players_idx on public.matches (player_a, player_b);

alter table public.matches enable row level security;

drop policy if exists "players can see their own matches" on public.matches;
create policy "players can see their own matches"
  on public.matches for select
  using (auth.uid() = player_a or auth.uid() = player_b);

-- Inserts/updates to matches always go through the server (service role),
-- which bypasses RLS — so no client-facing insert/update policy is defined.
-- This is deliberate: it's what makes the match state server-authoritative.

-- ---------------------------------------------------------------------------
-- CHALLENGES
-- A friend-to-friend invite to play. On acceptance the server creates a
-- `matches` row and links it here.
-- ---------------------------------------------------------------------------
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  match_id uuid references public.matches(id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_challenge check (challenger_id <> opponent_id)
);

create index if not exists challenges_opponent_idx on public.challenges (opponent_id, status);
create index if not exists challenges_challenger_idx on public.challenges (challenger_id, status);

alter table public.challenges enable row level security;

drop policy if exists "see own challenges" on public.challenges;
create policy "see own challenges"
  on public.challenges for select
  using (auth.uid() = challenger_id or auth.uid() = opponent_id);

drop policy if exists "send challenges" on public.challenges;
create policy "send challenges"
  on public.challenges for insert
  with check (auth.uid() = challenger_id);

drop policy if exists "respond to or cancel a challenge" on public.challenges;
create policy "respond to or cancel a challenge"
  on public.challenges for update
  using (auth.uid() = opponent_id or auth.uid() = challenger_id)
  with check (auth.uid() = opponent_id or auth.uid() = challenger_id);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('friend_request', 'friend_accepted', 'challenge', 'challenge_accepted', 'challenge_declined', 'match_result', 'achievement')),
  payload jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, read, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "see own notifications" on public.notifications;
create policy "see own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "mark own notifications read" on public.notifications;
create policy "mark own notifications read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Inserts happen server-side only (service role) so one user can't spam
-- notifications into another user's feed directly.

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever someone finishes signing up.
-- The username is taken from the `username` field passed in signUp() options.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'player_' || substr(new.id::text, 1, 8))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Realtime: broadcast row changes for live match play and notifications.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.challenges;
