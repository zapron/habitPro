-- Push tokens (one row per device per user). Cleared on logout from the client.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy "push_tokens_select_own"
  on public.push_tokens for select
  using (auth.uid() = user_id);

create policy "push_tokens_insert_own"
  on public.push_tokens for insert
  with check (auth.uid() = user_id);

create policy "push_tokens_update_own"
  on public.push_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "push_tokens_delete_own"
  on public.push_tokens for delete
  using (auth.uid() = user_id);

-- IANA timezone for server-side streak reminders (client updates on session).
alter table public.profiles
  add column if not exists timezone text;

comment on column public.profiles.timezone is 'IANA timezone (e.g. Asia/Kolkata) for streak reminder window; set from device.';

-- One reminder per user/habit/calendar day (user-local date string YYYY-MM-DD).
create table if not exists public.streak_reminder_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id text not null,
  reminder_date text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, habit_id, reminder_date)
);

create index if not exists streak_reminder_log_user_idx on public.streak_reminder_log (user_id);

alter table public.streak_reminder_log enable row level security;
-- RLS on with no policies: deny authenticated/anon API access; service_role bypasses for Edge Functions.
