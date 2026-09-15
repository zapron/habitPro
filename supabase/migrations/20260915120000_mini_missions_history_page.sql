-- Paginated + searchable history for the current user's own mini missions.
-- Mirrors rpc_challenge_streak_members_page_v1's shape exactly (security
-- definer, auth.uid() guard, fetch limit+1 to compute hasMore, one
-- jsonb_build_object('items', 'hasMore', 'nextOffset') return).
--
-- Row-shaped via to_jsonb(m) — the whole row, not an explicit column list —
-- deliberately the same technique rpc_focus_delta_v1 already uses for
-- mini_missions, to avoid the jsonb_to_recordset explicit-column-list trap
-- that has already silently dropped a field twice (task_checklist,
-- capture_mode). Any future new column on mini_missions is included here
-- automatically, no migration needed on this function.
--
-- p_query, when set, matches title/objective AND anything inside
-- completion_memory — the classic single note, every checklist task's note,
-- every freeform-captured moment's label/note. Rather than enumerate each of
-- those nested jsonb shapes individually (which has changed more than once
-- this app's history: task_checklist, capture_mode, freeform draftMemories),
-- completion_memory::text ilike catches all current and future text fields
-- inside it in one clause. Existing indexes (mini_missions_user_created_idx,
-- idx_mini_missions_user_updated_at) already cover the ordering; ilike
-- itself can't use a btree index, but at current per-user row counts (low
-- hundreds) a sequential scan over the user's own pre-filtered rows is
-- trivial. Revisit with pg_trgm only if a single user's row count ever
-- reaches the thousands.
--
-- Read-only fetch of the current user's own data — no separate write-side
-- RPC needed alongside this one.

create or replace function public.rpc_mini_missions_history_page_v1(
  p_offset integer default 0,
  p_limit integer default 30,
  p_status text default null,
  p_query text default null
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
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  with page_raw as (
    select m.*
    from public.mini_missions m
    where m.user_id = uid
      and (p_status is null or m.status = p_status)
      and (
        v_query is null
        or m.title ilike ('%' || v_query || '%')
        or m.objective ilike ('%' || v_query || '%')
        or m.completion_memory::text ilike ('%' || v_query || '%')
      )
    order by m.created_at desc, m.id asc
    offset v_offset
    limit (v_limit + 1)
  ),
  page as (
    select * from page_raw
    order by created_at desc, id asc
    limit v_limit
  )
  select
    coalesce(jsonb_agg(to_jsonb(page.*) order by page.created_at desc, page.id asc), '[]'::jsonb),
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

grant execute on function public.rpc_mini_missions_history_page_v1(integer, integer, text, text) to authenticated;
