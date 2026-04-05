-- habitPro: profiles, habits, mini_missions with RLS.
-- Applied via Supabase CLI: npm run db:push (after db:link).

-- Profiles (XP + gamification totals)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  xp integer not null default 0,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Long-running missions
create table if not exists public.habits (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  mode text not null check (mode in ('autopilot', 'manual')),
  start_date timestamptz not null,
  end_date timestamptz,
  completed_dates jsonb not null default '[]'::jsonb,
  streak integer not null default 0,
  total_days integer not null,
  is_completed boolean not null default false,
  status text not null default 'active' check (status in ('active', 'completed', 'failed')),
  updated_at timestamptz default now(),
  primary key (user_id, id)
);

alter table public.habits enable row level security;

create policy "habits_all_own"
  on public.habits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Time-boxed mini missions
create table if not exists public.mini_missions (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  objective text,
  estimated_minutes integer not null,
  extended_minutes integer not null default 0,
  status text not null,
  created_at timestamptz not null,
  scheduled_start_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  primary key (user_id, id)
);

alter table public.mini_missions enable row level security;

create policy "mini_missions_all_own"
  on public.mini_missions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-create profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, xp)
  values (new.id, 0)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
