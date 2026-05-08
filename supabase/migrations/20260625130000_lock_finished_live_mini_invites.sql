-- Prevent reopening a Live Squad once every existing participant has a final status.

create or replace function public.rpc_invite_live_mini_participant(
  p_squad_id uuid,
  p_invitee_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_squad public.live_mini_squads%rowtype;
  v_existing public.live_mini_participants%rowtype;
  v_participant_id uuid;
  v_inviter_username text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.profile_is_premium(uid) then
    raise exception 'premium_required';
  end if;
  if p_invitee_id is null or p_invitee_id = uid then
    raise exception 'choose another user';
  end if;

  select * into v_squad
  from public.live_mini_squads
  where id = p_squad_id
    and creator_id = uid
    and status = 'active';
  if not found then
    raise exception 'live mini squad not found';
  end if;

  perform public.rpc_refresh_live_mini_missed(p_squad_id);

  if not exists (
    select 1
    from public.live_mini_participants
    where squad_id = p_squad_id
      and status not in ('completed', 'missed', 'cancelled', 'declined')
  ) then
    raise exception 'Live Squad is already finished.';
  end if;

  select * into v_existing
  from public.live_mini_participants
  where squad_id = p_squad_id
    and user_id = p_invitee_id;
  if found then
    raise exception 'This person already has a live mini invite.';
  end if;

  insert into public.live_mini_participants (squad_id, user_id, role, status)
  values (p_squad_id, p_invitee_id, 'member', 'invited')
  returning id into v_participant_id;

  v_inviter_username := public._live_mini_profile_username(uid);

  perform public.rpc_insert_notification(
    p_invitee_id,
    'live_mini_invite',
    jsonb_build_object(
      'schema', 'habitpro.notification.v1',
      'kind', 'live_mini_invite',
      'live_mini_squad_id', p_squad_id,
      'squad_id', p_squad_id,
      'inviter_id', uid,
      'inviter_username', v_inviter_username,
      'mini_mission_title', v_squad.title,
      'mini_mission_objective', v_squad.objective
    )
  );

  return v_participant_id;
end;
$$;

grant execute on function public.rpc_invite_live_mini_participant(uuid, uuid) to authenticated;
