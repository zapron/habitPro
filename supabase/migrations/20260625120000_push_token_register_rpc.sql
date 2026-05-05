-- Make push registration single-active-account per install/token.
-- Logout still deletes best-effort, but login registration now cleans stale rows too.

with ranked as (
  select
    id,
    row_number() over (
      partition by device_id
      order by updated_at desc, created_at desc, id desc
    ) as rn
  from public.push_tokens
  where device_id is not null and btrim(device_id) <> ''
)
delete from public.push_tokens p
using ranked r
where p.id = r.id
  and r.rn > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by expo_push_token
      order by updated_at desc, created_at desc, id desc
    ) as rn
  from public.push_tokens
  where expo_push_token is not null and btrim(expo_push_token) <> ''
)
delete from public.push_tokens p
using ranked r
where p.id = r.id
  and r.rn > 1;

create or replace function public.rpc_register_push_token(
  p_device_id text,
  p_expo_push_token text,
  p_platform text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_device_id text := btrim(coalesce(p_device_id, ''));
  v_expo_push_token text := btrim(coalesce(p_expo_push_token, ''));
  v_platform text := lower(btrim(coalesce(p_platform, 'unknown')));
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_device_id = '' then
    raise exception 'device_id is required' using errcode = '22023';
  end if;

  if v_expo_push_token = '' then
    raise exception 'expo_push_token is required' using errcode = '22023';
  end if;

  if v_platform not in ('ios', 'android', 'unknown') then
    v_platform := 'unknown';
  end if;

  delete from public.push_tokens
  where (device_id = v_device_id or expo_push_token = v_expo_push_token)
    and not (user_id = v_uid and device_id = v_device_id);

  insert into public.push_tokens (
    user_id,
    device_id,
    expo_push_token,
    platform,
    updated_at
  )
  values (
    v_uid,
    v_device_id,
    v_expo_push_token,
    v_platform,
    now()
  )
  on conflict (user_id, device_id) do update
  set
    expo_push_token = excluded.expo_push_token,
    platform = excluded.platform,
    updated_at = now();
end;
$$;

revoke all on function public.rpc_register_push_token(text, text, text) from public;
grant execute on function public.rpc_register_push_token(text, text, text) to authenticated;
