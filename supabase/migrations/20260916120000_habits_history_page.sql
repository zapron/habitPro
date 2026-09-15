-- Phase 2 of the pagination/search roadmap: same shape as
-- rpc_mini_missions_history_page_v1 (20260915120000), applied to habits
-- (main missions) for Home's accomplished/failed reports segment.
--
-- Unlike mini_missions.status, a habit's effective report
-- (accomplished/failed) is derived client-side in sync.ts's
-- habitFromRow() — it reconciles mission_report against is_completed,
-- timezone-aware grid-completion state, legacy repaired dates, and
-- streak-memory-marker evidence. Reimplementing that derivation in SQL
-- would duplicate genuinely delicate business logic in a second
-- language. Per explicit decision, this RPC filters on the stored
-- columns directly (mission_report / is_completed / status) as a
-- proxy — correct for the vast majority of habits, with rare
-- edge-case drift accepted as a known, deferred limitation (nothing is
-- actually lost today since Home still loads every habit locally in
-- parallel with this RPC; it only matters once a hot-window cutoff
-- makes this the sole source for older rows).
--
-- No p_query/search param in this phase — main missions are far fewer
-- per user than mini missions, so text search wasn't judged worth
-- building here (explicit decision, 2026-09-16).

create or replace function public.rpc_habits_history_page_v1(
  p_offset integer default 0,
  p_limit integer default 30,
  p_status text default null
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
  v_limit integer := least(50, greatest(1, coalesce(p_limit, 30)));
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if v_status is not null and v_status not in ('accomplished', 'failed') then
    raise exception 'invalid p_status: %', v_status;
  end if;

  with page_raw as (
    select h.*
    from public.habits h
    where h.user_id = uid
      and (
        v_status is null
        or (
          v_status = 'accomplished'
          and (h.mission_report = 'accomplished' or (h.mission_report is null and h.is_completed))
        )
        or (
          v_status = 'failed'
          and (h.mission_report = 'failed' or (h.mission_report is null and h.status = 'failed'))
        )
      )
    order by h.start_date desc, h.id asc
    offset v_offset
    limit (v_limit + 1)
  ),
  page as (
    select * from page_raw
    order by start_date desc, id asc
    limit v_limit
  )
  select
    coalesce(jsonb_agg(to_jsonb(page.*) order by page.start_date desc, page.id asc), '[]'::jsonb),
    (select count(*) > v_limit from page_raw)
  into v_items, v_has_more
  from page;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'hasMore', coalesce(v_has_more, false),
    'nextOffset', case when coalesce(v_has_more, false) then v_offset + v_limit else null end,
    'serverNow', now()
  );
end;
$$;

grant execute on function public.rpc_habits_history_page_v1(integer, integer, text) to authenticated;
