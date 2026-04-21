-- Change custom squad note limit from once-ever to once per UTC day.
-- Keeps preset nudges daily-limited (see existing indices) and updates the RPC error for UX.

drop index if exists public.challenge_nudges_custom_note_once_idx;

-- At most one custom note per UTC calendar day per (challenge, sender, recipient).
create unique index if not exists challenge_nudges_custom_note_one_per_day_idx
  on public.challenge_nudges (
    challenge_id,
    from_user_id,
    to_user_id,
    ((created_at at time zone 'utc')::date)
  )
  where kind = 'custom_note';

create or replace function public.rpc_send_challenge_custom_nudge(
  p_challenge_id uuid,
  p_to_user_id uuid,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_from_username text;
  v_trim text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if uid = p_to_user_id then
    raise exception 'cannot nudge yourself';
  end if;
  if not coalesce((select p.is_premium from public.profiles p where p.id = uid), false) then
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

  begin
    insert into public.challenge_nudges (challenge_id, from_user_id, to_user_id, kind, message)
    values (p_challenge_id, uid, p_to_user_id, 'custom_note', v_trim)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'custom_note_daily_limit';
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
      'message', v_trim
    )
  );
end;
$$;

