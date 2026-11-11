-- Live mini missions: show each participant's moments to the squad WHILE the
-- mission is running, not only after Complete.
--
-- 1. rpc_sync_live_mini_progress used to drop p_memory_gallery unless the final
--    status was completed/missed. It now also stores it for in_progress, so the
--    app can push draft moments as they are logged / edited / removed (an empty
--    array clears the strip). Old app builds send null while in progress, which
--    coalesce() leaves untouched, so they behave exactly as before.
-- 2. live_mini_participants was never in the supabase_realtime publication, so
--    subscribeLiveMiniSquad() (app/live-mini/[id].tsx) never fired and the board
--    only refreshed on focus / pull-to-refresh. Adding it makes partner updates
--    (start, moments, complete) arrive live. RLS (live_mini_participants_select_squad)
--    still decides who receives each row change.

CREATE OR REPLACE FUNCTION public.rpc_sync_live_mini_progress(p_squad_id uuid, p_local_mini_mission_id text, p_status text, p_reserve_minutes integer DEFAULT 0, p_started_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_completed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_memory_note text DEFAULT NULL::text, p_memory_image_url text DEFAULT NULL::text, p_memory_gallery jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_participant public.live_mini_participants%rowtype;
  v_squad public.live_mini_squads%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_reserve integer := greatest(0, least(10, coalesce(p_reserve_minutes, 0)));
  v_started timestamptz;
  v_deadline timestamptz;
  v_completed timestamptz;
  v_final_status text;
  v_elapsed integer;
  v_username text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if v_status not in ('joined', 'in_progress', 'completed', 'missed', 'cancelled') then
    raise exception 'invalid live mini status';
  end if;

  select * into v_participant
  from public.live_mini_participants
  where squad_id = p_squad_id
    and user_id = uid
  for update;
  if not found then
    raise exception 'live mini participant not found';
  end if;

  if v_participant.status = 'completed' then
    update public.live_mini_participants
    set
      memory_note = coalesce(nullif(trim(coalesce(p_memory_note, '')), ''), memory_note),
      memory_image_url = coalesce(nullif(trim(coalesce(p_memory_image_url, '')), ''), memory_image_url),
      memory_gallery = coalesce(p_memory_gallery, memory_gallery)
    where id = v_participant.id;
    return;
  end if;

  -- Already flipped to 'missed' (almost always by rpc_refresh_live_mini_missed's
  -- background sweep, which has no per-user memory to attach) — still worth
  -- accepting a late memory-only sync instead of discarding it.
  if v_participant.status = 'missed' then
    update public.live_mini_participants
    set
      memory_note = coalesce(nullif(trim(coalesce(p_memory_note, '')), ''), memory_note),
      memory_image_url = coalesce(nullif(trim(coalesce(p_memory_image_url, '')), ''), memory_image_url),
      memory_gallery = coalesce(p_memory_gallery, memory_gallery)
    where id = v_participant.id;
    return;
  end if;

  if v_participant.status in ('declined', 'cancelled') then
    return;
  end if;

  select * into v_squad
  from public.live_mini_squads
  where id = p_squad_id;
  if not found then
    raise exception 'live mini squad not found';
  end if;

  v_started := coalesce(p_started_at, v_participant.started_at);
  v_deadline := public._live_mini_deadline(v_started, v_participant.planned_minutes, v_reserve);
  v_completed := p_completed_at;
  v_final_status := v_status;
  v_elapsed := null;

  if v_status = 'completed' then
    if v_started is null or v_completed is null then
      raise exception 'started_at and completed_at are required for completion';
    end if;
    if v_deadline is not null and v_completed > v_deadline then
      v_final_status := 'missed';
      v_completed := null;
    else
      v_elapsed := public._live_mini_elapsed_seconds(v_started, v_completed);
    end if;
  elsif v_status = 'in_progress' and v_deadline is not null and now() > v_deadline then
    v_final_status := 'missed';
  elsif v_status = 'missed' then
    v_completed := null;
  elsif v_status = 'cancelled' then
    v_completed := null;
  end if;

  update public.live_mini_participants
  set
    status = v_final_status,
    local_mini_mission_id = coalesce(nullif(trim(coalesce(p_local_mini_mission_id, '')), ''), local_mini_mission_id),
    reserve_minutes = v_reserve,
    started_at = v_started,
    deadline_at = v_deadline,
    completed_at = v_completed,
    final_elapsed_seconds = v_elapsed,
    memory_note = case
      when v_final_status in ('completed', 'missed') then coalesce(nullif(trim(coalesce(p_memory_note, '')), ''), memory_note)
      else memory_note
    end,
    memory_image_url = case
      when v_final_status in ('completed', 'missed') then coalesce(nullif(trim(coalesce(p_memory_image_url, '')), ''), memory_image_url)
      else memory_image_url
    end,
    memory_gallery = case
      when v_final_status in ('in_progress', 'completed', 'missed') then coalesce(p_memory_gallery, memory_gallery)
      else memory_gallery
    end
  where id = v_participant.id;

  if v_final_status = 'completed' and uid <> v_squad.creator_id then
    v_username := public._live_mini_profile_username(uid);
    perform public.rpc_insert_notification(
      v_squad.creator_id,
      'live_mini_completed',
      jsonb_build_object(
        'schema', 'habitpro.notification.v1',
        'kind', 'live_mini_completed',
        'live_mini_squad_id', p_squad_id,
        'squad_id', p_squad_id,
        'participant_id', uid,
        'participant_username', v_username,
        'mini_mission_title', v_squad.title,
        'elapsed_seconds', v_elapsed
      )
    );
  end if;
end;
$function$

;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_mini_participants'
  ) then
    alter publication supabase_realtime add table public.live_mini_participants;
  end if;
end $$;
