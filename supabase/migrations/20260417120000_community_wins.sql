-- Public "wins" feed for shared mini mission completions + cheers.

create table if not exists public.community_wins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mini_mission_id text not null,
  title text not null,
  completed_at timestamptz not null,
  memory_note text,
  memory_image_url text,
  created_at timestamptz not null default now(),
  unique (user_id, mini_mission_id)
);

create index if not exists community_wins_created_at_idx
  on public.community_wins (created_at desc);

create table if not exists public.community_win_cheers (
  id uuid primary key default gen_random_uuid(),
  win_id uuid not null references public.community_wins (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (win_id, user_id)
);

create index if not exists community_win_cheers_win_id_idx
  on public.community_win_cheers (win_id);

alter table public.community_wins enable row level security;
alter table public.community_win_cheers enable row level security;

create policy "community_wins_select_authenticated"
  on public.community_wins for select
  to authenticated
  using (true);

create policy "community_wins_insert_own"
  on public.community_wins for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "community_wins_update_own"
  on public.community_wins for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "community_wins_delete_own"
  on public.community_wins for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "community_win_cheers_select_authenticated"
  on public.community_win_cheers for select
  to authenticated
  using (true);

create policy "community_win_cheers_insert_own"
  on public.community_win_cheers for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "community_win_cheers_delete_own"
  on public.community_win_cheers for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "profiles_select_community_win_authors"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.community_wins w
      where w.user_id = profiles.id
    )
  );
