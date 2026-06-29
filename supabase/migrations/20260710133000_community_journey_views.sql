-- Public journey profile views.
-- Counts repeated non-self visits while keeping individual viewer rows behind RPCs.

create table if not exists public.community_journey_views (
  id uuid primary key default gen_random_uuid(),
  profile_user_id uuid not null references auth.users (id) on delete cascade,
  viewer_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists community_journey_views_profile_created_idx
  on public.community_journey_views (profile_user_id, created_at desc);

create index if not exists community_journey_views_viewer_created_idx
  on public.community_journey_views (viewer_user_id, created_at desc);

alter table public.community_journey_views enable row level security;

create or replace function public.rpc_community_journey_view_count_v1(
  p_profile_user_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.community_journey_views v
  where v.profile_user_id = p_profile_user_id;
$$;

grant execute on function public.rpc_community_journey_view_count_v1(uuid) to authenticated;

create or replace function public.rpc_record_community_journey_view_v1(
  p_profile_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_profile_user_id is null then
    return 0;
  end if;

  if uid is distinct from p_profile_user_id then
    insert into public.community_journey_views (profile_user_id, viewer_user_id)
    values (p_profile_user_id, uid);
  end if;

  return public.rpc_community_journey_view_count_v1(p_profile_user_id);
end;
$$;

grant execute on function public.rpc_record_community_journey_view_v1(uuid) to authenticated;
