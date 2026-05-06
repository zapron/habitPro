-- Preserve Live Mini memory when status-only progress syncs race with completion memory sync.

create or replace function public.rpc_sync_live_mini_progress(
  p_squad_id uuid,
  p_local_mini_mission_id text,
  p_status text,
  p_reserve_minutes integer default 0,
  p_started_at timestamptz default null,
  p_completed_at timestamptz default null,
  p_memory_note text default null,
  p_memory_image_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
      memory_image_url = coalesce(nullif(trim(coalesce(p_memory_image_url, '')), ''), memory_image_url)
    where id = v_participant.id;
    return;
  end if;

  if v_participant.status in ('declined', 'missed', 'cancelled') then
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
      when v_final_status = 'completed' then coalesce(nullif(trim(coalesce(p_memory_note, '')), ''), memory_note)
      else memory_note
    end,
    memory_image_url = case
      when v_final_status = 'completed' then coalesce(nullif(trim(coalesce(p_memory_image_url, '')), ''), memory_image_url)
      else memory_image_url
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
$$;

grant execute on function public.rpc_sync_live_mini_progress(uuid, text, text, integer, timestamptz, timestamptz, text, text) to authenticated;

update public.live_mini_participants p
set
  memory_note = coalesce(
    p.memory_note,
    nullif(trim(coalesce(m.completion_memory ->> 'note', '')), '')
  ),
  memory_image_url = coalesce(
    p.memory_image_url,
    nullif(trim(coalesce(m.completion_memory ->> 'imageUrl', '')), '')
  )
from public.mini_missions m
where p.user_id = m.user_id
  and p.local_mini_mission_id = m.id
  and p.status = 'completed'
  and (
    p.memory_note is null
    or p.memory_image_url is null
  );
