-- Faster squad repair hydration: pending-only index plus compact repair snapshot RPC.

create index if not exists streak_repairs_challenge_status_created_idx
  on public.streak_repairs (challenge_id, status, created_at desc);

create or replace function public.rpc_challenge_pending_repairs_v1(
  p_challenge_id uuid,
  p_offset integer default 0,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_limit integer := least(50, greatest(1, coalesce(p_limit, 20)));
  v_payload jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_challenge_id is null or not public.user_is_challenge_member(p_challenge_id, uid) then
    raise exception 'not a member';
  end if;

  with page_raw as (
    select r.*
    from public.streak_repairs r
    where r.challenge_id = p_challenge_id
      and r.status = 'pending'
      and (
        r.user_id = uid
        or not exists (
          select 1
          from public.streak_repair_votes v
          where v.repair_id = r.id
            and v.voter_id = uid
        )
      )
    order by r.created_at desc
    offset v_offset
    limit (v_limit + 1)
  ),
  page as (
    select *
    from page_raw
    order by created_at desc
    limit v_limit
  ),
  repair_json as (
    select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb) as repairs
    from page p
  ),
  vote_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'repair_id', v.repair_id,
          'voter_id', v.voter_id,
          'vote', v.vote
        )
        order by v.created_at asc
      ),
      '[]'::jsonb
    ) as votes
    from public.streak_repair_votes v
    where v.repair_id in (select p.id from page p)
  ),
  label_json as (
    select coalesce(
      jsonb_object_agg(
        p.id::text,
        jsonb_build_object(
          'username', lower(coalesce(p.username::text, 'member')),
          'displayName', nullif(trim(coalesce(p.display_name, '')), ''),
          'xp', coalesce(p.xp, 0)
        )
      ),
      '{}'::jsonb
    ) as labels
    from public.profiles p
    where p.id in (select page.user_id from page)
  ),
  more_json as (
    select (count(*) > v_limit) as has_more
    from page_raw
  )
  select jsonb_build_object(
    'repairs', repair_json.repairs,
    'votes', vote_json.votes,
    'profileLabels', label_json.labels,
    'hasMore', more_json.has_more
  )
    into v_payload
  from repair_json, vote_json, label_json, more_json;

  return coalesce(v_payload, jsonb_build_object(
    'repairs', '[]'::jsonb,
    'votes', '[]'::jsonb,
    'profileLabels', '{}'::jsonb,
    'hasMore', false
  ));
end;
$$;

grant execute on function public.rpc_challenge_pending_repairs_v1(uuid, integer, integer) to authenticated;
