-- Snappiness snapshot/read-model RPCs.
-- Goal: make first paint small, keep tap mutations tiny/idempotent, and avoid UI waterfalls.

create index if not exists idx_community_wins_created_id
  on public.community_wins (created_at desc, id desc);

create index if not exists idx_mini_missions_completed_user
  on public.mini_missions (user_id, status, completed_at desc)
  where status = 'completed' and completed_at is not null;

alter table public.mini_missions
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_habits_user_updated_at
  on public.habits (user_id, updated_at desc);

create index if not exists idx_mini_missions_user_updated_at
  on public.mini_missions (user_id, updated_at desc);

create or replace function public._hp_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_mini_missions_updated_at on public.mini_missions;
create trigger trg_mini_missions_updated_at
  before update on public.mini_missions
  for each row
  execute function public._hp_touch_updated_at();

create or replace function public.rpc_bootstrap_snapshot_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_profile jsonb;
  v_habits jsonb := '[]'::jsonb;
  v_minis jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'username', nullif(lower(coalesce(p.username::text, '')), ''),
    'displayName', nullif(trim(coalesce(p.display_name, '')), ''),
    'xp', coalesce(p.xp, 0),
    'isPremium', coalesce(p.is_premium, false),
    'timezone', p.timezone,
    'updatedAt', p.updated_at
  )
    into v_profile
  from public.profiles p
  where p.id = uid;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', h.id,
        'title', h.title,
        'description', h.description,
        'mode', h.mode,
        'visibility', h.visibility,
        'startDate', h.start_date,
        'endDate', h.end_date,
        'completedDates', coalesce(h.completed_dates, '[]'::jsonb),
        'streak', h.streak,
        'totalDays', h.total_days,
        'isCompleted', h.is_completed,
        'status', h.status,
        'challengeGroupId', h.challenge_group_id,
        'missionTimezone', h.mission_timezone,
        'updatedAt', h.updated_at
      )
      order by h.updated_at desc, h.id asc
    ),
    '[]'::jsonb
  )
    into v_habits
  from public.habits h
  where h.user_id = uid;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'title', m.title,
        'objective', m.objective,
        'estimatedMinutes', m.estimated_minutes,
        'extendedMinutes', m.extended_minutes,
        'status', m.status,
        'createdAt', m.created_at,
        'scheduledStartAt', m.scheduled_start_at,
        'startedAt', m.started_at,
        'completedAt', m.completed_at,
        'visibility', m.visibility,
        'communityFeedRevoked', m.community_feed_revoked,
        'liveSquadId', m.live_squad_id,
        'liveSquadRole', m.live_squad_role,
        'updatedAt', m.updated_at
      )
      order by m.updated_at desc, m.id asc
    ),
    '[]'::jsonb
  )
    into v_minis
  from public.mini_missions m
  where m.user_id = uid;

  return jsonb_build_object(
    'profile', v_profile,
    'habitsLite', v_habits,
    'miniMissionsLite', v_minis,
    'usernameReady', coalesce(length(v_profile->>'username') > 0, false),
    'isPremium', coalesce((v_profile->>'isPremium')::boolean, false),
    'entitlementsCheckedAt', v_now,
    'serverNow', v_now,
    'version', v_now
  );
end;
$$;

grant execute on function public.rpc_bootstrap_snapshot_v1() to authenticated;

create or replace function public.rpc_focus_delta_v1(p_since timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_since timestamptz := coalesce(p_since, '-infinity'::timestamptz);
  v_now timestamptz := now();
  v_profile jsonb;
  v_habits jsonb := '[]'::jsonb;
  v_minis jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'username', nullif(lower(coalesce(p.username::text, '')), ''),
    'displayName', nullif(trim(coalesce(p.display_name, '')), ''),
    'xp', coalesce(p.xp, 0),
    'isPremium', coalesce(p.is_premium, false),
    'timezone', p.timezone,
    'updatedAt', p.updated_at
  )
    into v_profile
  from public.profiles p
  where p.id = uid;

  select coalesce(jsonb_agg(to_jsonb(h) order by h.updated_at desc, h.id asc), '[]'::jsonb)
    into v_habits
  from public.habits h
  where h.user_id = uid
    and h.updated_at > v_since;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.updated_at desc, m.id asc), '[]'::jsonb)
    into v_minis
  from public.mini_missions m
  where m.user_id = uid
    and m.updated_at > v_since;

  return jsonb_build_object(
    'changedHabits', v_habits,
    'changedMinis', v_minis,
    'profilePatch', v_profile,
    'deletedIds', jsonb_build_object('habits', '[]'::jsonb, 'miniMissions', '[]'::jsonb),
    'serverNow', v_now,
    'version', v_now
  );
end;
$$;

grant execute on function public.rpc_focus_delta_v1(timestamptz) to authenticated;

create or replace function public._hp_profile_label_json(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'userId', p.id,
        'username', nullif(lower(coalesce(p.username::text, '')), ''),
        'displayName', nullif(trim(coalesce(p.display_name, '')), ''),
        'xp', coalesce(p.xp, 0)
      )
      from public.profiles p
      where p.id = p_user_id
    ),
    jsonb_build_object('userId', p_user_id, 'username', null, 'displayName', null, 'xp', 0)
  );
$$;

revoke all on function public._hp_profile_label_json(uuid) from public;

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

create or replace function public.rpc_live_mini_snapshot_v1(p_squad_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public._hp_live_mini_snapshot_json(p_squad_id);
$$;

grant execute on function public.rpc_live_mini_snapshot_v1(uuid) to authenticated;

create or replace function public.rpc_create_live_mini_squad_v2(
  p_mini_mission_id text,
  p_title text,
  p_objective text,
  p_planned_minutes integer,
  p_started_at timestamptz default null,
  p_return_snapshot boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_squad_id uuid;
begin
  v_squad_id := public.rpc_create_live_mini_squad(
    p_mini_mission_id,
    p_title,
    p_objective,
    p_planned_minutes,
    p_started_at
  );

  return jsonb_build_object(
    'ok', true,
    'squadId', v_squad_id,
    'snapshot', case when coalesce(p_return_snapshot, true) then public._hp_live_mini_snapshot_json(v_squad_id) else null end
  );
end;
$$;

grant execute on function public.rpc_create_live_mini_squad_v2(text, text, text, integer, timestamptz, boolean) to authenticated;

create or replace function public.rpc_accept_live_mini_invite_v2(
  p_squad_id uuid,
  p_local_mini_mission_id text,
  p_planned_minutes integer,
  p_started_at timestamptz default now(),
  p_return_snapshot boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rpc_accept_live_mini_invite(
    p_squad_id,
    p_local_mini_mission_id,
    p_planned_minutes,
    p_started_at
  );

  return jsonb_build_object(
    'ok', true,
    'snapshot', case when coalesce(p_return_snapshot, true) then public._hp_live_mini_snapshot_json(p_squad_id) else null end
  );
end;
$$;

grant execute on function public.rpc_accept_live_mini_invite_v2(uuid, text, integer, timestamptz, boolean) to authenticated;

create or replace function public.rpc_community_feed_page_v1(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 15
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 15), 1), 40);
  v_items jsonb := '[]'::jsonb;
  v_next_cursor jsonb := null;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  with raw as (
    select w.*
    from public.community_wins w
    where (
      p_cursor_created_at is null
      or (w.created_at, w.id) < (p_cursor_created_at, coalesce(p_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    )
    order by w.created_at desc, w.id desc
    limit v_limit + 1
  ),
  page_rows as (
    select *
    from raw
    order by created_at desc, id desc
    limit v_limit
  ),
  shaped as (
    select
      w.created_at,
      w.id,
      jsonb_build_object(
        'win', to_jsonb(w),
        'author', public._hp_profile_label_json(w.user_id),
        'cheerCount', coalesce(c.cheer_count, 0),
        'viewerHasCheered', exists (
          select 1
          from public.community_win_cheers mine
          where mine.win_id = w.id
            and mine.user_id = uid
        ),
        'image', jsonb_build_object(
          'thumbUrl', w.memory_image_url,
          'fullUrl', w.memory_image_url,
          'width', null,
          'height', null,
          'blurhash', null
        )
      ) as item
    from page_rows w
    left join lateral (
      select count(*)::integer as cheer_count
      from public.community_win_cheers cc
      where cc.win_id = w.id
    ) c on true
  )
  select coalesce(jsonb_agg(item order by created_at desc, id desc), '[]'::jsonb)
    into v_items
  from shaped;

  select jsonb_build_object('createdAt', r.created_at, 'id', r.id)
    into v_next_cursor
  from (
    select *
    from public.community_wins w
    where (
      p_cursor_created_at is null
      or (w.created_at, w.id) < (p_cursor_created_at, coalesce(p_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    )
    order by w.created_at desc, w.id desc
    offset v_limit
    limit 1
  ) r;

  return jsonb_build_object(
    'items', v_items,
    'nextCursor', v_next_cursor,
    'serverNow', now()
  );
end;
$$;

grant execute on function public.rpc_community_feed_page_v1(timestamptz, uuid, integer) to authenticated;

create or replace function public.rpc_send_challenge_nudge_v2(
  p_challenge_id uuid,
  p_to_user_id uuid,
  p_kind text,
  p_activity_id uuid default null
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
    activity_id
  )
  values (
    p_challenge_id,
    uid,
    p_to_user_id,
    v_kind,
    case when v_kind = 'congrats' then p_activity_id else null end
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
      'kind', v_kind
    )
  );

  return jsonb_build_object(
    'ok', true,
    'nudge', to_jsonb(v_inserted),
    'notificationQueued', true
  );
end;
$$;

grant execute on function public.rpc_send_challenge_nudge_v2(uuid, uuid, text, uuid) to authenticated;

create or replace function public.rpc_challenge_snapshot_v1(p_challenge_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_group jsonb;
  v_members jsonb := '[]'::jsonb;
  v_repairs jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.user_is_challenge_member(p_challenge_id, uid) then
    raise exception 'not a member';
  end if;

  select to_jsonb(g)
    into v_group
  from public.challenge_groups g
  where g.id = p_challenge_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'member', to_jsonb(m),
        'label', public._hp_profile_label_json(m.user_id),
        'habitSummary', case
          when h.id is null then null
          else jsonb_build_object(
            'id', h.id,
            'title', h.title,
            'mode', h.mode,
            'status', h.status,
            'streak', h.streak,
            'totalDays', h.total_days,
            'completedCount', jsonb_array_length(coalesce(h.completed_dates, '[]'::jsonb)),
            'isCompleted', h.is_completed,
            'updatedAt', h.updated_at
          )
        end
      )
      order by m.joined_at asc, m.user_id asc
    ),
    '[]'::jsonb
  )
    into v_members
  from public.challenge_members m
  left join public.habits h
    on h.user_id = m.user_id
   and h.id = m.habit_id
  where m.challenge_id = p_challenge_id;

  with repair_rows as (
    select r.*
    from public.streak_repairs r
    where r.challenge_id = p_challenge_id
      and r.status = 'pending'
    order by r.created_at desc, r.id desc
    limit 6
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'repair', to_jsonb(r),
        'requester', public._hp_profile_label_json(r.user_id),
        'votes', coalesce(
          (
            select jsonb_agg(to_jsonb(v) order by v.created_at asc)
            from public.streak_repair_votes v
            where v.repair_id = r.id
          ),
          '[]'::jsonb
        )
      )
      order by r.created_at desc, r.id desc
    ),
    '[]'::jsonb
  )
    into v_repairs
  from repair_rows r;

  return jsonb_build_object(
    'group', v_group,
    'members', v_members,
    'myCapabilities', jsonb_build_object(
      'canNudge', public.profile_is_premium(uid),
      'canCustomNote', public.profile_is_premium(uid),
      'canRepairVote', true
    ),
    'pendingRepairsPreview', jsonb_build_object(
      'items', v_repairs,
      'nextCursor', null
    ),
    'serverNow', now()
  );
end;
$$;

grant execute on function public.rpc_challenge_snapshot_v1(uuid) to authenticated;

create or replace function public.rpc_challenge_activity_page_v1(
  p_challenge_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 60);
  v_items jsonb := '[]'::jsonb;
  v_next_cursor jsonb := null;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.user_is_challenge_member(p_challenge_id, uid) then
    raise exception 'not a member';
  end if;

  with raw as (
    select a.*
    from public.challenge_activity a
    where a.challenge_id = p_challenge_id
      and (
        p_cursor_created_at is null
        or (a.created_at, a.id) < (p_cursor_created_at, coalesce(p_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      )
    order by a.created_at desc, a.id desc
    limit v_limit + 1
  ),
  page_rows as (
    select *
    from raw
    order by created_at desc, id desc
    limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc, a.id desc), '[]'::jsonb)
    into v_items
  from page_rows a;

  select jsonb_build_object('createdAt', r.created_at, 'id', r.id)
    into v_next_cursor
  from (
    select *
    from public.challenge_activity a
    where a.challenge_id = p_challenge_id
      and (
        p_cursor_created_at is null
        or (a.created_at, a.id) < (p_cursor_created_at, coalesce(p_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      )
    order by a.created_at desc, a.id desc
    offset v_limit
    limit 1
  ) r;

  return jsonb_build_object('items', v_items, 'nextCursor', v_next_cursor, 'serverNow', now());
end;
$$;

grant execute on function public.rpc_challenge_activity_page_v1(uuid, timestamptz, uuid, integer) to authenticated;

create or replace function public.rpc_invites_page_v1(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_items jsonb := '[]'::jsonb;
  v_next_cursor jsonb := null;
  v_pending_count integer := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  perform public.rpc_refresh_live_mini_expired_invites(null);

  select
    coalesce((select count(*) from public.challenge_invites ci where ci.invitee_id = uid and ci.status = 'pending'), 0)
    +
    coalesce((
      select count(*)
      from public.live_mini_participants lp
      where lp.user_id = uid
        and lp.role = 'member'
        and lp.status = 'invited'
        and (lp.invite_expires_at is null or lp.invite_expires_at > now())
    ), 0)
    into v_pending_count;

  with group_rows as (
    select
      ci.created_at,
      ci.id,
      jsonb_build_object(
        'kind', 'group',
        'id', ci.id,
        'status', ci.status,
        'actionable', ci.status = 'pending',
        'createdAt', ci.created_at,
        'expiresAt', null,
        'actor', public._hp_profile_label_json(ci.inviter_id),
        'mission', jsonb_build_object(
          'id', cg.id,
          'title', coalesce(nullif(cg.habit_template->>'title', ''), cg.title),
          'description', nullif(cg.habit_template->>'description', ''),
          'plannedMinutes', null
        ),
        'raw', jsonb_build_object('inviteId', ci.id, 'challengeId', ci.challenge_id)
      ) as item
    from public.challenge_invites ci
    join public.challenge_groups cg on cg.id = ci.challenge_id
    where ci.invitee_id = uid
  ),
  live_rows as (
    select
      lp.created_at,
      lp.id,
      jsonb_build_object(
        'kind', 'live',
        'id', lp.id,
        'status', lp.status,
        'actionable', lp.status = 'invited' and (lp.invite_expires_at is null or lp.invite_expires_at > now()),
        'createdAt', lp.created_at,
        'expiresAt', lp.invite_expires_at,
        'actor', public._hp_profile_label_json(ls.creator_id),
        'mission', jsonb_build_object(
          'id', ls.id,
          'title', ls.title,
          'description', ls.objective,
          'plannedMinutes', lp.planned_minutes
        ),
        'raw', jsonb_build_object('squadId', ls.id, 'participantId', lp.id)
      ) as item
    from public.live_mini_participants lp
    join public.live_mini_squads ls on ls.id = lp.squad_id
    where lp.user_id = uid
      and lp.role = 'member'
  ),
  merged as (
    select * from group_rows
    union all
    select * from live_rows
  ),
  raw as (
    select *
    from merged
    where (
      p_cursor_created_at is null
      or (created_at, id) < (p_cursor_created_at, coalesce(p_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    )
    order by created_at desc, id desc
    limit v_limit + 1
  ),
  page_rows as (
    select *
    from raw
    order by created_at desc, id desc
    limit v_limit
  )
  select coalesce(jsonb_agg(item order by created_at desc, id desc), '[]'::jsonb)
    into v_items
  from page_rows;

  with group_rows as (
    select ci.created_at, ci.id
    from public.challenge_invites ci
    where ci.invitee_id = uid
  ),
  live_rows as (
    select lp.created_at, lp.id
    from public.live_mini_participants lp
    where lp.user_id = uid
      and lp.role = 'member'
  ),
  merged as (
    select * from group_rows
    union all
    select * from live_rows
  )
  select jsonb_build_object('createdAt', r.created_at, 'id', r.id)
    into v_next_cursor
  from (
    select *
    from merged
    where (
      p_cursor_created_at is null
      or (created_at, id) < (p_cursor_created_at, coalesce(p_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    )
    order by created_at desc, id desc
    offset v_limit
    limit 1
  ) r;

  return jsonb_build_object(
    'items', v_items,
    'nextCursor', v_next_cursor,
    'pendingCount', v_pending_count,
    'serverNow', now()
  );
end;
$$;

grant execute on function public.rpc_invites_page_v1(timestamptz, uuid, integer) to authenticated;

create table if not exists public.weekly_user_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  week_start date not null,
  username citext,
  display_name text,
  xp integer not null default 0,
  points integer not null default 0,
  habit_days integer not null default 0,
  mini_completions integer not null default 0,
  generated_at timestamptz not null default now()
);

create index if not exists weekly_user_stats_rank_idx
  on public.weekly_user_stats (points desc, xp desc, username asc, user_id)
  where username is not null;

create or replace function public.refresh_weekly_user_stats_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_tz text;
  v_week_start date;
  v_habit_days integer := 0;
  v_mini_completions integer := 0;
  v_points integer := 0;
begin
  select
    p.id,
    p.username,
    p.display_name,
    coalesce(nullif(p.timezone, ''), 'UTC') as tz,
    greatest(coalesce(p.xp, 0), 0)::integer as xp
    into v_profile
  from public.profiles p
  where p.id = p_user_id;

  if not found or nullif(trim(coalesce(v_profile.username::text, '')), '') is null then
    delete from public.weekly_user_stats where user_id = p_user_id;
    return;
  end if;

  v_tz := v_profile.tz;
  v_week_start := (
    ((now() at time zone v_tz)::date)
    - (((extract(dow from (now() at time zone v_tz)::date)::integer + 6) % 7)::integer)
  )::date;

  select coalesce(count(distinct (h.id, d.day_key)) filter (where d.day_key is not null), 0)::integer
    into v_habit_days
  from public.habits h
  left join lateral (
    select raw_date::date as day_key
    from jsonb_array_elements_text(coalesce(h.completed_dates, '[]'::jsonb)) as dates(raw_date)
    where raw_date ~ '^\d{4}-\d{2}-\d{2}$'
  ) d
    on d.day_key >= v_week_start
   and d.day_key < v_week_start + 7
  where h.user_id = p_user_id;

  select coalesce(count(m.id), 0)::integer
    into v_mini_completions
  from public.mini_missions m
  where m.user_id = p_user_id
    and m.status = 'completed'
    and m.completed_at is not null
    and (m.completed_at at time zone v_tz)::date >= v_week_start
    and (m.completed_at at time zone v_tz)::date < v_week_start + 7;

  v_points := v_habit_days * 25 + v_mini_completions * 12;

  insert into public.weekly_user_stats (
    user_id,
    week_start,
    username,
    display_name,
    xp,
    points,
    habit_days,
    mini_completions,
    generated_at
  )
  values (
    p_user_id,
    v_week_start,
    v_profile.username,
    v_profile.display_name,
    v_profile.xp,
    v_points,
    v_habit_days,
    v_mini_completions,
    now()
  )
  on conflict (user_id) do update set
    week_start = excluded.week_start,
    username = excluded.username,
    display_name = excluded.display_name,
    xp = excluded.xp,
    points = excluded.points,
    habit_days = excluded.habit_days,
    mini_completions = excluded.mini_completions,
    generated_at = now();
end;
$$;

grant execute on function public.refresh_weekly_user_stats_for_user(uuid) to authenticated;

create or replace function public._hp_refresh_weekly_user_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  perform public.refresh_weekly_user_stats_for_user(v_user_id);
  return null;
end;
$$;

drop trigger if exists trg_habits_weekly_user_stats on public.habits;
create trigger trg_habits_weekly_user_stats
  after insert or update or delete on public.habits
  for each row
  execute function public._hp_refresh_weekly_user_stats_trigger();

drop trigger if exists trg_mini_missions_weekly_user_stats on public.mini_missions;
create trigger trg_mini_missions_weekly_user_stats
  after insert or update or delete on public.mini_missions
  for each row
  execute function public._hp_refresh_weekly_user_stats_trigger();

create or replace function public._hp_refresh_weekly_profile_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_weekly_user_stats_for_user(new.id);
  return null;
end;
$$;

drop trigger if exists trg_profiles_weekly_user_stats on public.profiles;
create trigger trg_profiles_weekly_user_stats
  after insert or update of username, display_name, xp, timezone on public.profiles
  for each row
  execute function public._hp_refresh_weekly_profile_trigger();

select public.refresh_weekly_user_stats_for_user(p.id)
from public.profiles p
where p.username is not null
  and length(trim(p.username::text)) > 0;

create or replace function public.get_weekly_leaderboard_v2(p_limit int default 20, p_offset int default 0)
returns table (
  rank_position int,
  user_id uuid,
  username citext,
  display_name text,
  xp int,
  level int,
  points int,
  habit_days int,
  mini_completions int
)
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

  perform public.refresh_weekly_user_stats_for_user(uid);

  return query
  with ranked as (
    select
      s.*,
      row_number() over (
        order by s.points desc, s.xp desc, lower(s.username::text) asc, s.user_id asc
      )::int as rn
    from public.weekly_user_stats s
    where s.username is not null
      and s.generated_at > now() - interval '8 days'
  )
  select
    r.rn,
    r.user_id,
    r.username,
    r.display_name,
    r.xp,
    (r.xp / 250)::int as level,
    r.points,
    r.habit_days,
    r.mini_completions
  from ranked r
  order by r.rn asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function public.get_weekly_leaderboard_v2(int, int) to authenticated;
