-- AI Coach Spike (removable experiment).
-- Removal: run `supabase/scripts/remove_ai_coach_spike.sql`.
-- This migration creates only ai_coach_spike-owned objects and does not alter
-- existing HabitPro product tables, triggers, notifications, XP, premium, or mission data.

create schema if not exists ai_spike;

create table if not exists ai_spike.coach_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  intent text not null,
  provider text not null,
  status text not null,
  prompt_tokens integer,
  completion_tokens integer,
  error text,
  client_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ai_spike.usage_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references ai_spike.coach_requests(id) on delete cascade,
  user_id uuid not null,
  intent text not null,
  provider text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_coach_spike_requests_user_created_idx
  on ai_spike.coach_requests (user_id, created_at desc);

create index if not exists ai_coach_spike_usage_user_created_idx
  on ai_spike.usage_events (user_id, created_at desc);

alter table ai_spike.coach_requests enable row level security;
alter table ai_spike.usage_events enable row level security;

revoke all on schema ai_spike from public, anon, authenticated;
revoke all on all tables in schema ai_spike from public, anon, authenticated;
grant usage on schema ai_spike to service_role;
grant select, insert, delete on all tables in schema ai_spike to service_role;

create or replace function public.ai_coach_spike_usage_count(
  p_user_id uuid,
  p_since timestamptz
)
returns integer
language sql
security definer
set search_path = ai_spike, public
as $$
  select count(*)::integer
  from ai_spike.usage_events
  where user_id = p_user_id
    and created_at >= p_since;
$$;

create or replace function public.ai_coach_spike_record_usage(
  p_user_id uuid,
  p_intent text,
  p_provider text,
  p_status text,
  p_prompt_tokens integer default null,
  p_completion_tokens integer default null,
  p_error text default null,
  p_client_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ai_spike, public
as $$
declare
  v_request_id uuid;
begin
  insert into ai_spike.coach_requests (
    user_id,
    intent,
    provider,
    status,
    prompt_tokens,
    completion_tokens,
    error,
    client_context
  )
  values (
    p_user_id,
    coalesce(nullif(trim(p_intent), ''), 'today'),
    coalesce(nullif(trim(p_provider), ''), 'mock'),
    coalesce(nullif(trim(p_status), ''), 'ok'),
    p_prompt_tokens,
    p_completion_tokens,
    nullif(trim(coalesce(p_error, '')), ''),
    coalesce(p_client_context, '{}'::jsonb)
  )
  returning id into v_request_id;

  if p_status = 'ok' or p_status = 'mock_fallback' then
    insert into ai_spike.usage_events (request_id, user_id, intent, provider)
    values (
      v_request_id,
      p_user_id,
      coalesce(nullif(trim(p_intent), ''), 'today'),
      coalesce(nullif(trim(p_provider), ''), 'mock')
    );
  end if;

  return v_request_id;
end;
$$;

revoke all on function public.ai_coach_spike_usage_count(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.ai_coach_spike_record_usage(uuid, text, text, text, integer, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.ai_coach_spike_usage_count(uuid, timestamptz) to service_role;
grant execute on function public.ai_coach_spike_record_usage(uuid, text, text, text, integer, integer, text, jsonb) to service_role;

