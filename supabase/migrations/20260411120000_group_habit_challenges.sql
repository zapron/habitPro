-- Group habit challenges: username, challenge groups, invites, notifications, cohort habit read.
-- Run: npm run db:push (after db:link)

create extension if not exists citext;

alter table public.profiles
  add column if not exists username citext;

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username::text))
  where username is not null;

alter table public.profiles
  add column if not exists display_name text;

create table if not exists public.challenge_groups (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  habit_template jsonb not null default '{}'::jsonb,
  creator_timezone text not null default 'UTC',
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'ended', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists challenge_groups_creator_idx on public.challenge_groups (creator_id);

-- challenge_members must exist before RLS policies on challenge_groups that reference it.
create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenge_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id text not null,
  role text not null default 'member' check (role in ('creator', 'member')),
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create index if not exists challenge_members_user_idx on public.challenge_members (user_id);

-- Membership checks must not subquery challenge_members inside RLS on that table (infinite recursion).
-- SECURITY DEFINER runs as the function owner and bypasses RLS for the inner read.
create or replace function public.user_is_challenge_member(p_challenge_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.challenge_members m
    where m.challenge_id = p_challenge_id
      and m.user_id = p_user_id
  );
$$;

revoke all on function public.user_is_challenge_member(uuid, uuid) from public;
grant execute on function public.user_is_challenge_member(uuid, uuid) to authenticated;

alter table public.challenge_groups enable row level security;

create policy "challenge_groups_select_member"
  on public.challenge_groups for select
  using (
    auth.uid() = creator_id
    or public.user_is_challenge_member(id, auth.uid())
  );

create policy "challenge_groups_insert_creator"
  on public.challenge_groups for insert
  with check (auth.uid() = creator_id);

create policy "challenge_groups_update_creator"
  on public.challenge_groups for update
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

alter table public.challenge_members enable row level security;

create policy "challenge_members_select_participant"
  on public.challenge_members for select
  using (public.user_is_challenge_member(challenge_id, auth.uid()));

create policy "challenge_members_insert_self_or_creator"
  on public.challenge_members for insert
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.challenge_groups g
      where g.id = challenge_id and g.creator_id = auth.uid()
    )
  );

create table if not exists public.challenge_invites (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenge_groups (id) on delete cascade,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  invitee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (challenge_id, invitee_id)
);

create index if not exists challenge_invites_invitee_idx on public.challenge_invites (invitee_id, status);

alter table public.challenge_invites enable row level security;

create policy "challenge_invites_select_party"
  on public.challenge_invites for select
  using (auth.uid() = inviter_id or auth.uid() = invitee_id);

create policy "challenge_invites_insert_inviter"
  on public.challenge_invites for insert
  with check (
    auth.uid() = inviter_id
    and public.user_is_challenge_member(challenge_invites.challenge_id, auth.uid())
  );

create policy "challenge_invites_update_invitee"
  on public.challenge_invites for update
  using (auth.uid() = invitee_id)
  with check (auth.uid() = invitee_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications_own"
  on public.notifications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.habits
  add column if not exists challenge_group_id uuid references public.challenge_groups (id) on delete set null;

alter table public.habits
  add column if not exists challenge_creator_timezone text;

create index if not exists habits_challenge_group_idx on public.habits (challenge_group_id)
  where challenge_group_id is not null;

drop policy if exists "habits_all_own" on public.habits;

create policy "habits_select_own_or_cohort"
  on public.habits for select
  using (
    auth.uid() = user_id
    or (
      challenge_group_id is not null
      and public.user_is_challenge_member(habits.challenge_group_id, auth.uid())
    )
  );

create policy "habits_insert_own"
  on public.habits for insert
  with check (auth.uid() = user_id);

create policy "habits_update_own"
  on public.habits for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "habits_delete_own"
  on public.habits for delete
  using (auth.uid() = user_id);

create table if not exists public.challenge_memory_comments (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenge_groups (id) on delete cascade,
  subject_user_id uuid not null references auth.users (id) on delete cascade,
  date_str text not null,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists challenge_memory_comments_lookup_idx
  on public.challenge_memory_comments (challenge_id, subject_user_id, date_str);

alter table public.challenge_memory_comments enable row level security;

create policy "challenge_memory_comments_participant"
  on public.challenge_memory_comments for all
  using (
    public.user_is_challenge_member(challenge_memory_comments.challenge_id, auth.uid())
  )
  with check (
    auth.uid() = author_id
    and public.user_is_challenge_member(challenge_memory_comments.challenge_id, auth.uid())
  );

create table if not exists public.challenge_memory_likes (
  challenge_id uuid not null references public.challenge_groups (id) on delete cascade,
  subject_user_id uuid not null references auth.users (id) on delete cascade,
  date_str text not null,
  liker_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (challenge_id, subject_user_id, date_str, liker_id)
);

alter table public.challenge_memory_likes enable row level security;

create policy "challenge_memory_likes_participant"
  on public.challenge_memory_likes for all
  using (
    public.user_is_challenge_member(challenge_memory_likes.challenge_id, auth.uid())
  )
  with check (
    auth.uid() = liker_id
    and public.user_is_challenge_member(challenge_memory_likes.challenge_id, auth.uid())
  );

create or replace function public.search_profiles_by_username(p_prefix text, p_limit int default 20)
returns table (id uuid, username citext, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name
  from public.profiles p
  where p.username is not null
    and lower(p.username::text) like lower(trim(p_prefix)) || '%'
  order by p.username asc
  limit least(coalesce(p_limit, 20), 50);
$$;

grant execute on function public.search_profiles_by_username(text, int) to authenticated;

create or replace function public.rpc_insert_notification(
  p_user_id uuid,
  p_type text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.notifications (user_id, type, payload)
  values (p_user_id, p_type, coalesce(p_payload, '{}'::jsonb));
end;
$$;

grant execute on function public.rpc_insert_notification(uuid, text, jsonb) to authenticated;
