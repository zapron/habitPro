-- Performance: denormalize community_wins.comment_count the same way
-- cheer_count was denormalized in 20260702130000_perf_cheer_count_denormalized.sql
-- — so the feed RPC doesn't run a per-row COUNT(*) over community_win_comments
-- for every page item once comment counts show up in the main feed too.
--
-- A trigger keeps the cached count exact on every comment insert/delete (fires
-- regardless of write source: client, RPC, dashboard). The feed RPC is
-- rewritten to also expose `commentCount`, read from the cached column;
-- everything else about its output shape is unchanged.
--
-- Run: npm run db:push (or manually). Safe to re-run.

-- ============================================================
-- 1) Cached count column
-- ============================================================
alter table public.community_wins
  add column if not exists comment_count integer not null default 0;

-- ============================================================
-- 2) Trigger to keep it in sync
-- ============================================================
create or replace function public.tg_community_win_comments_maintain_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_wins
      set comment_count = comment_count + 1
      where id = new.win_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_wins
      set comment_count = greatest(0, comment_count - 1)
      where id = old.win_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_community_win_comments_maintain_count on public.community_win_comments;
create trigger trg_community_win_comments_maintain_count
  after insert or delete on public.community_win_comments
  for each row
  execute function public.tg_community_win_comments_maintain_count();

-- ============================================================
-- 3) Backfill existing rows (idempotent)
-- ============================================================
update public.community_wins w
  set comment_count = coalesce(c.cnt, 0)
  from (
    select win_id, count(*)::integer as cnt
    from public.community_win_comments
    group by win_id
  ) c
  where c.win_id = w.id
    and w.comment_count is distinct from c.cnt;

-- Wins with zero comments (no matching group) — ensure they read 0, not stale.
update public.community_wins w
  set comment_count = 0
  where not exists (
    select 1 from public.community_win_comments cc where cc.win_id = w.id
  )
  and w.comment_count <> 0;

-- ============================================================
-- 4) Rewrite the feed RPC to also expose the cached comment count
--    (identical to the live definition except the added commentCount field)
-- ============================================================
create or replace function public.rpc_community_feed_page_v1(
  p_cursor_created_at timestamp with time zone default null::timestamp with time zone,
  p_cursor_id uuid default null::uuid,
  p_limit integer default 15
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
        -- strip both denormalized columns from the win payload so `win` stays
        -- byte-identical to the pre-migration shape (counts are exposed as
        -- cheerCount / commentCount instead)
        'win', to_jsonb(w) - 'cheer_count' - 'comment_count',
        'author', public._hp_profile_label_json(w.user_id),
        'cheerCount', coalesce(w.cheer_count, 0),
        'commentCount', coalesce(w.comment_count, 0),
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
$function$;
