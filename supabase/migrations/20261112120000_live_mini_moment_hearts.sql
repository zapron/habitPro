-- Live squad: a silent heart on a squad member's moment.
--
-- One row = one person hearting one moment (a memory_gallery item, keyed by its
-- taskId) of another squad member. No notification row is ever written, so no
-- push goes out: the moment owner sees it only as a subtle fill animation on the
-- squad board, which hears about it through realtime. Mirrors the shape of
-- challenge_memory_likes (group missions).

create table if not exists public.live_mini_moment_hearts (
  squad_id uuid not null references public.live_mini_squads(id) on delete cascade,
  subject_user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null check (char_length(task_id) between 1 and 120),
  liker_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (squad_id, subject_user_id, task_id, liker_id),
  check (liker_id <> subject_user_id)
);

create index if not exists live_mini_moment_hearts_liker_id_idx
  on public.live_mini_moment_hearts (liker_id);
create index if not exists live_mini_moment_hearts_subject_user_id_idx
  on public.live_mini_moment_hearts (subject_user_id);

alter table public.live_mini_moment_hearts enable row level security;

drop policy if exists live_mini_moment_hearts_select on public.live_mini_moment_hearts;
create policy live_mini_moment_hearts_select on public.live_mini_moment_hearts
  for select to authenticated
  using (public.user_is_live_mini_participant(squad_id, (select auth.uid())));

drop policy if exists live_mini_moment_hearts_insert on public.live_mini_moment_hearts;
create policy live_mini_moment_hearts_insert on public.live_mini_moment_hearts
  for insert to authenticated
  with check (
    liker_id = (select auth.uid())
    and public.user_is_live_mini_participant(squad_id, (select auth.uid()))
    and public.user_is_live_mini_participant(squad_id, subject_user_id)
  );

drop policy if exists live_mini_moment_hearts_delete on public.live_mini_moment_hearts;
create policy live_mini_moment_hearts_delete on public.live_mini_moment_hearts
  for delete to authenticated
  using (liker_id = (select auth.uid()));

grant select, insert, delete on public.live_mini_moment_hearts to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_mini_moment_hearts'
  ) then
    alter publication supabase_realtime add table public.live_mini_moment_hearts;
  end if;
end $$;
