-- Adds avatarUrl to the Live Mini squad snapshot's inline profile-label
-- JSON. Unlike the community feed / challenge RPCs, this one builds its
-- own profile object directly (jsonb_object_agg over public.profiles)
-- rather than going through the shared _hp_profile_label_json helper, so
-- it needs its own explicit field addition.

create or replace function public._hp_live_mini_snapshot_json(p_squad_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_squad public.live_mini_squads%rowtype;
  v_participants jsonb := '[]'::jsonb;
  v_profiles jsonb := '{}'::jsonb;
  v_my_participant jsonb := null;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_squad
  from public.live_mini_squads
  where id = p_squad_id;

  if not found then
    return null;
  end if;

  if v_squad.creator_id <> uid and not public.user_is_live_mini_participant(p_squad_id, uid) then
    raise exception 'not a participant';
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at asc, p.id asc), '[]'::jsonb)
    into v_participants
  from public.live_mini_participants p
  where p.squad_id = p_squad_id;

  with profile_ids as (
    select v_squad.creator_id as id
    union
    select p.user_id
    from public.live_mini_participants p
    where p.squad_id = p_squad_id
  )
  select coalesce(
    jsonb_object_agg(
      pr.id,
      jsonb_build_object(
        'username', nullif(lower(coalesce(pr.username::text, '')), ''),
        'displayName', nullif(trim(coalesce(pr.display_name, '')), ''),
        'avatarUrl', pr.avatar_url,
        'xp', pr.xp
      )
    ),
    '{}'::jsonb
  )
    into v_profiles
  from public.profiles pr
  join profile_ids ids on ids.id = pr.id;

  select to_jsonb(p)
    into v_my_participant
  from public.live_mini_participants p
  where p.squad_id = p_squad_id
    and p.user_id = uid
  limit 1;

  return jsonb_build_object(
    'squad', to_jsonb(v_squad),
    'participants', v_participants,
    'profiles', v_profiles,
    'myParticipant', v_my_participant,
    'serverNow', now()
  );
end;
$$;

revoke all on function public._hp_live_mini_snapshot_json(uuid) from public;
