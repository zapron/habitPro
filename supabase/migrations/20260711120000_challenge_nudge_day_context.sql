alter table public.challenge_nudges
  add column if not exists target_date_str text,
  add column if not exists target_mission_day integer;

comment on column public.challenge_nudges.target_date_str is
  'YYYY-MM-DD streak-memory date when a nudge was sent from a specific squad post.';
comment on column public.challenge_nudges.target_mission_day is
  '1-based mission day when a nudge was sent from a specific squad post.';

create or replace function public.rpc_send_challenge_nudge_v2(
  p_challenge_id uuid,
  p_to_user_id uuid,
  p_kind text,
  p_activity_id uuid default null,
  p_target_date_str text default null,
  p_target_mission_day integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_inserted public.challenge_nudges%rowtype;
  v_from_username text;
  v_target_date_str text := nullif(trim(coalesce(p_target_date_str, '')), '');
  v_target_mission_day integer := case
    when coalesce(p_target_mission_day, 0) > 0 then p_target_mission_day
    else null
  end;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if uid = p_to_user_id then
    raise exception 'cannot nudge yourself';
  end if;
  if v_kind not in ('cheer', 'ping', 'fire', 'congrats') then
    raise exception 'invalid_nudge_kind';
  end if;
  if v_target_date_str is not null and v_target_date_str !~ '^\d{4}-\d{2}-\d{2}$' then
    v_target_date_str := null;
  end if;
  if not public.user_is_challenge_member(p_challenge_id, uid)
     or not public.user_is_challenge_member(p_challenge_id, p_to_user_id) then
    raise exception 'not a member';
  end if;
  if not public.profile_is_premium(uid) then
    raise exception 'premium_required';
  end if;

  insert into public.challenge_nudges (
    challenge_id,
    from_user_id,
    to_user_id,
    kind,
    activity_id,
    target_date_str,
    target_mission_day
  )
  values (
    p_challenge_id,
    uid,
    p_to_user_id,
    v_kind,
    case when v_kind = 'congrats' then p_activity_id else null end,
    v_target_date_str,
    v_target_mission_day
  )
  returning * into v_inserted;

  select nullif(lower(coalesce(p.username::text, '')), '')
    into v_from_username
  from public.profiles p
  where p.id = uid;

  perform public.rpc_insert_notification(
    p_to_user_id,
    'challenge_nudge',
    jsonb_build_object(
      'challenge_id', p_challenge_id,
      'nudge_id', v_inserted.id,
      'from_user_id', uid,
      'from_username', v_from_username,
      'kind', v_kind,
      'target_date_str', v_target_date_str,
      'target_mission_day', v_target_mission_day
    )
  );

  return jsonb_build_object(
    'ok', true,
    'nudge', to_jsonb(v_inserted),
    'notificationQueued', true
  );
end;
$$;

grant execute on function public.rpc_send_challenge_nudge_v2(uuid, uuid, text, uuid, text, integer) to authenticated;

drop function if exists public.rpc_send_challenge_nudge_v2(uuid, uuid, text, uuid);

create or replace function public.rpc_send_challenge_custom_nudge(
  p_challenge_id uuid,
  p_to_user_id uuid,
  p_message text,
  p_target_date_str text default null,
  p_target_mission_day integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_trim text;
  v_id uuid;
  v_from_username text;
  v_target_date_str text := nullif(trim(coalesce(p_target_date_str, '')), '');
  v_target_mission_day integer := case
    when coalesce(p_target_mission_day, 0) > 0 then p_target_mission_day
    else null
  end;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if uid = p_to_user_id then
    raise exception 'cannot nudge yourself';
  end if;
  if not public.profile_is_premium(uid) then
    raise exception 'premium_required';
  end if;
  if not public.user_is_challenge_member(p_challenge_id, uid) then
    raise exception 'not a member';
  end if;
  if not public.user_is_challenge_member(p_challenge_id, p_to_user_id) then
    raise exception 'recipient not a member';
  end if;

  v_trim := trim(both from coalesce(p_message, ''));
  if length(v_trim) < 1 or length(v_trim) > 200 then
    raise exception 'invalid_message_length';
  end if;
  if v_target_date_str is not null and v_target_date_str !~ '^\d{4}-\d{2}-\d{2}$' then
    v_target_date_str := null;
  end if;

  begin
    insert into public.challenge_nudges (
      challenge_id,
      from_user_id,
      to_user_id,
      kind,
      message,
      target_date_str,
      target_mission_day
    )
    values (
      p_challenge_id,
      uid,
      p_to_user_id,
      'custom_note',
      v_trim,
      v_target_date_str,
      v_target_mission_day
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'custom_note_already_sent';
  end;

  select nullif(trim(lower(username::text)), '') into v_from_username
  from public.profiles
  where id = uid;

  perform public.rpc_insert_notification(
    p_to_user_id,
    'challenge_nudge',
    jsonb_build_object(
      'challenge_id', p_challenge_id,
      'nudge_id', v_id,
      'from_user_id', uid,
      'from_username', v_from_username,
      'kind', 'custom_note',
      'message', v_trim,
      'target_date_str', v_target_date_str,
      'target_mission_day', v_target_mission_day
    )
  );
end;
$$;

revoke all on function public.rpc_send_challenge_custom_nudge(uuid, uuid, text, text, integer) from public;
grant execute on function public.rpc_send_challenge_custom_nudge(uuid, uuid, text, text, integer) to authenticated;

drop function if exists public.rpc_send_challenge_custom_nudge(uuid, uuid, text);
