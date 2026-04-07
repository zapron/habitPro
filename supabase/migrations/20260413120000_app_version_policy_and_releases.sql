-- Public read-only app version policy (force-update) and release history for raw APK / sideload flows.
-- Update rows in Supabase Dashboard (SQL) or service role; anon users only read.

create table if not exists public.app_version_policy (
  id smallint primary key default 1,
  constraint app_version_policy_singleton check (id = 1),
  min_android_version text,
  min_ios_version text,
  latest_android_version text,
  latest_ios_version text,
  android_download_url text,
  ios_download_url text,
  force_update_message text,
  updated_at timestamptz not null default now()
);

comment on table public.app_version_policy is
  'Singleton (id=1): minimum app versions per platform and download URLs for mandatory updates.';

insert into public.app_version_policy (id) values (1)
on conflict (id) do nothing;

alter table public.app_version_policy enable row level security;

-- Policies are created once; avoid DROP IF EXISTS here (first run would emit PG NOTICE).
create policy "app_version_policy_select_public"
  on public.app_version_policy for select
  using (true);

-- Optional history of shipped versions (for your records and in-app display).
create table if not exists public.app_version_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  platform text not null default 'android' check (platform in ('android', 'ios', 'all')),
  download_url text,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.app_version_releases is
  'Append-only style list of published app versions; manage via Dashboard / service role.';

create index if not exists app_version_releases_created_at_idx
  on public.app_version_releases (created_at desc);

alter table public.app_version_releases enable row level security;

create policy "app_version_releases_select_public"
  on public.app_version_releases for select
  using (true);
