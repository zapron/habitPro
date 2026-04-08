-- Cohort nudges (peer reactions) and milestone activity feed. Member-only RLS.

create table if not exists public.challenge_nudges (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenge_groups (id) on delete cascade,
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('cheer', 'same', 'fire', 'congrats')),
  created_at timestamptz not null default now(),
  constraint challenge_nudges_no_self check (from_user_id <> to_user_id)
);

create index if not exists challenge_nudges_challenge_created_idx
  on public.challenge_nudges (challenge_id, created_at desc);

-- At most one nudge of each kind from A to B per UTC calendar day (rate limit).
create unique index if not exists challenge_nudges_one_per_day_idx
  on public.challenge_nudges (
    challenge_id,
    from_user_id,
    to_user_id,
    kind,
    ((created_at at time zone 'utc')::date)
  );

alter table public.challenge_nudges enable row level security;

create policy "challenge_nudges_select_member"
  on public.challenge_nudges for select
  using (public.user_is_challenge_member(challenge_id, auth.uid()));

create policy "challenge_nudges_insert_sender_member"
  on public.challenge_nudges for insert
  with check (
    auth.uid() = from_user_id
    and public.user_is_challenge_member(challenge_id, auth.uid())
    and public.user_is_challenge_member(challenge_id, to_user_id)
  );

-- Milestone rows (deduped per actor + kind + value).
create table if not exists public.challenge_activity (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenge_groups (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('mission_day', 'streak_milestone')),
  value int not null check (value > 0),
  created_at timestamptz not null default now(),
  unique (challenge_id, actor_user_id, kind, value)
);

create index if not exists challenge_activity_challenge_created_idx
  on public.challenge_activity (challenge_id, created_at desc);

alter table public.challenge_activity enable row level security;

create policy "challenge_activity_select_member"
  on public.challenge_activity for select
  using (public.user_is_challenge_member(challenge_id, auth.uid()));

create policy "challenge_activity_insert_actor"
  on public.challenge_activity for insert
  with check (
    auth.uid() = actor_user_id
    and public.user_is_challenge_member(challenge_id, auth.uid())
  );
